import re
import shutil
import subprocess

import numpy as np
import pyloudnorm as pyln
import pytest
import soundfile as sf

from atelier.audio.loudness import normalize_loudness

SR = 48_000
TARGET = -23.0
CEILING_DB = -1.0
CEILING = 10 ** (CEILING_DB / 20)


def make_noise(seconds=3.0, std=0.05, channels=2, seed=0):
    """Ruído gaussiano com seed fixa: mesmo teste, mesmo resultado, sempre."""
    rng = np.random.default_rng(seed)
    shape = (int(SR * seconds), channels) if channels > 1 else (int(SR * seconds),)
    return rng.normal(0.0, std, shape)


def loudness_of(samples):
    return pyln.Meter(SR).integrated_loudness(samples)


def peak_of(samples):
    return float(np.max(np.abs(samples)))


@pytest.mark.parametrize("channels", [1, 2])
@pytest.mark.parametrize("std", [0.01, 0.05, 0.1])
def test_reaches_target(std, channels):
    out = normalize_loudness(make_noise(std=std, channels=channels), SR, TARGET, CEILING_DB)
    assert loudness_of(out) == pytest.approx(TARGET, abs=0.1)


def test_peak_never_exceeds_ceiling():
    x = make_noise(std=0.01)
    x[SR] = 0.9  # um clique forte no meio de um áudio quieto
    out = normalize_loudness(x, SR, -14.0, CEILING_DB)  # alvo alto: pede muito ganho
    assert peak_of(out) <= CEILING + 1e-9


def test_ceiling_wins_over_target():
    """Registra a decisão do ADR: quando os dois conflitam, o teto vence
    e o loudness fica ABAIXO do alvo. Se você escolher limiter ou falhar,
    este é o teste que muda."""
    x = make_noise(std=0.01)
    x[SR] = 0.9
    out = normalize_loudness(x, SR, -14.0, CEILING_DB)
    assert loudness_of(out) < -14.0 - 0.5
    assert peak_of(out) == pytest.approx(CEILING, rel=1e-6)


def test_idempotent():
    once = normalize_loudness(make_noise(), SR, TARGET, CEILING_DB)
    twice = normalize_loudness(once, SR, TARGET, CEILING_DB)
    assert np.allclose(once, twice, atol=1e-3)


def test_keeps_shape_and_dtype():
    x = make_noise().astype(np.float32)
    out = normalize_loudness(x, SR, TARGET, CEILING_DB)
    assert out.shape == x.shape
    assert out.dtype == x.dtype


def test_does_not_mutate_input():
    x = make_noise()
    before = x.copy()
    normalize_loudness(x, SR, TARGET, CEILING_DB)
    assert np.array_equal(x, before)


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg não instalado")
def test_agrees_with_ffmpeg(tmp_path):
    """Duas ferramentas independentes medindo o mesmo arquivo."""
    out = normalize_loudness(make_noise(seconds=5.0), SR, TARGET, CEILING_DB)
    wav = tmp_path / "out.wav"
    sf.write(wav, out, SR, subtype="FLOAT")
    run = subprocess.run(
        ["ffmpeg", "-nostats", "-i", str(wav), "-af", "ebur128", "-f", "null", "-"],
        capture_output=True, text=True, check=True,
    )
    summary = run.stderr.split("Summary:")[-1]
    match = re.search(r"I:\s+(-?\d+\.\d+) LUFS", summary)
    assert match, run.stderr[-500:]
    assert float(match.group(1)) == pytest.approx(TARGET, abs=0.5)