import json
import logging
import time
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from atelier.audio.audio_stage import AudioStage, AudioStageError
from atelier.config import Config
from atelier.stage import BuildContext

SR = 48_000


def make_config(tmp_path: Path, **overrides: object) -> Config:
    audio: dict[str, object] = {
        "sample_rate": 48000,
        "peak_ceiling_db": -1.0,
        "trim": {"threshold_db": -60.0, "margin_ms": 20.0},
        "sfx": {"target_lufs": -23.0, "apply_trim": True},
        "ambience": {"target_lufs": -30.0, "apply_trim": False, "crossfade_ms": 500.0},
        "assets": [
            {"id": "pop", "source": "pop.wav", "kind": "sfx"},
            {"id": "river", "source": "river.wav", "kind": "ambience"},
        ],
    }
    audio.update(overrides)
    return Config.model_validate(
        {
            "paths": {
                "sources": str(tmp_path / "src"),
                "output": str(tmp_path / "out"),
            },
            "audio": audio,
        }
    )


@pytest.fixture
def sources(tmp_path: Path) -> Path:
    src = tmp_path / "src"
    src.mkdir()
    rng = np.random.default_rng(0)
    t = np.arange(SR) / SR
    tone = 0.2 * np.sin(2 * np.pi * 440 * t) * np.exp(-3 * t)
    silence = np.zeros(SR // 2)
    pop = np.concatenate(
        [silence, tone, silence]
    )  # silêncio nas pontas: o trim tem o que cortar
    sf.write(src / "pop.wav", np.stack([pop, pop], axis=1), SR, subtype="FLOAT")
    sf.write(src / "river.wav", rng.normal(0, 0.05, (SR * 4, 2)), SR, subtype="FLOAT")
    return src


def run(tmp_path: Path, **overrides: object):  # type: ignore[no-untyped-def]
    return AudioStage().build(BuildContext(config=make_config(tmp_path, **overrides)))


def test_builds_files_and_entries(tmp_path: Path, sources: Path) -> None:
    result = run(tmp_path)
    assert [e.id for e in result.assets] == ["pop", "river"]
    for entry in result.assets:
        assert set(entry.files) == {"ogg", "m4a"}
        for rel in entry.files.values():
            assert (tmp_path / "out" / rel).is_file()
            assert rel.startswith("audio/") and f"{entry.id}." in rel


def test_meta_matches_target_and_ceiling(tmp_path: Path, sources: Path) -> None:
    pop, river = run(tmp_path).assets
    assert pop.meta["loudness_lufs"] == pytest.approx(-23.0, abs=0.2)
    assert river.meta["loudness_lufs"] == pytest.approx(-30.0, abs=0.2)
    assert river.meta["loop"] is True and pop.meta["loop"] is False
    assert isinstance(pop.meta["peak_db"], float) and pop.meta["peak_db"] <= -1.0
    # o trim cortou o silêncio: bem menos que os 2 s da fonte
    assert isinstance(pop.meta["duration_s"], float) and pop.meta["duration_s"] < 1.3
    # o crossfade deixa o rio 0,5 s mais curto que os 4 s da fonte
    assert river.meta["duration_s"] == pytest.approx(3.5, abs=0.001)


def test_second_run_is_skipped_and_identical(
    tmp_path: Path, sources: Path, caplog: pytest.LogCaptureFixture
) -> None:
    first = run(tmp_path)
    files = sorted((tmp_path / "out" / "audio").glob("*.ogg"))
    mtimes = [f.stat().st_mtime_ns for f in files]
    time.sleep(0.02)
    with caplog.at_level(logging.INFO):
        second = run(tmp_path)
    assert second.assets == first.assets
    assert caplog.text.count("pulado (cache)") == 2
    assert [f.stat().st_mtime_ns for f in files] == mtimes


def test_config_change_redoes_the_work(tmp_path: Path, sources: Path) -> None:
    before = run(tmp_path).assets[0]
    after = run(tmp_path, sfx={"target_lufs": -18.0, "apply_trim": True}).assets[0]
    assert after.files != before.files
    assert after.meta["loudness_lufs"] == pytest.approx(-18.0, abs=0.2)


def test_source_change_redoes_the_work(tmp_path: Path, sources: Path) -> None:
    before = run(tmp_path).assets[1]
    sf.write(
        sources / "river.wav",
        np.random.default_rng(9).normal(0, 0.05, (SR * 4, 2)),
        SR,
        subtype="FLOAT",
    )
    assert run(tmp_path).assets[1].files != before.files


def test_deterministic_across_clean_builds(tmp_path: Path, sources: Path) -> None:
    a = run(tmp_path)
    cache = tmp_path / "out" / "audio" / ".cache.json"
    cache.unlink()  # força refazer tudo, mesma máquina e mesma config
    b = run(tmp_path)
    assert a.assets == b.assets  # mesmos bytes ⇒ mesmos nomes (hash de conteúdo)


def test_conforms_6_channels_96khz(tmp_path: Path, sources: Path) -> None:
    rng = np.random.default_rng(2)
    sf.write(
        sources / "river.wav",
        rng.normal(0, 0.05, (96_000 * 3, 6)),
        96_000,
        subtype="FLOAT",
    )
    river = run(tmp_path).assets[1]
    assert river.meta["loudness_lufs"] == pytest.approx(-30.0, abs=0.3)
    assert river.meta["duration_s"] == pytest.approx(
        2.5, abs=0.01
    )  # 3 s − 0,5 s de crossfade


def test_reports_every_failing_asset(tmp_path: Path, sources: Path) -> None:
    (sources / "pop.wav").unlink()
    (sources / "river.wav").write_bytes(b"isto nao e um wav")
    with pytest.raises(AudioStageError) as info:
        run(tmp_path)
    message = str(info.value)
    assert "2 asset(s)" in message
    assert "pop" in message and "fonte não encontrada" in message
    assert "river" in message

def test_silent_source_passes_through_with_null_measures(
    tmp_path: Path, sources: Path
) -> None:
    sf.write(sources / "river.wav", np.zeros((SR * 4, 2)), SR, subtype="FLOAT")
    river = run(tmp_path).assets[1]
    assert river.meta["loudness_lufs"] is None and river.meta["peak_db"] is None
    json.dumps(
        river.model_dump(mode="json"), allow_nan=False
    ) 

def test_too_short_sfx_gives_a_clear_error(tmp_path: Path, sources: Path) -> None:
    sf.write(
        sources / "pop.wav", 0.1 * np.ones((SR // 10, 2)), SR, subtype="FLOAT"
    )  # 0,1 s
    with pytest.raises(AudioStageError, match="pop.*loudness"):
        run(tmp_path)


def test_no_temp_files_left_behind(tmp_path: Path, sources: Path) -> None:
    run(tmp_path)
    leftovers = [
        p.name
        for p in (tmp_path / "out" / "audio").iterdir()
        if p.name.startswith(".") and p.name != ".cache.json"
    ]
    assert leftovers == []


def test_cache_file_is_valid_json(tmp_path: Path, sources: Path) -> None:
    run(tmp_path)
    data = json.loads((tmp_path / "out" / "audio" / ".cache.json").read_text())
    assert set(data) == {"pop", "river"}