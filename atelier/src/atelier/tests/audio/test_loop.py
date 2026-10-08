import numpy as np
import pytest

from atelier.audio.loop import make_loop

SR = 1000


def noise(n: int, channels: int = 2, seed: int = 0) -> np.ndarray:
    return np.random.default_rng(seed).normal(0.0, 0.1, (n, channels))


@pytest.mark.parametrize("channels", [1, 2])
def test_length_and_channels(channels: int) -> None:
    x = noise(5000, channels)
    out = make_loop(x, SR, 500)  # fade = 500 amostras
    assert out.shape == (5000 - 500, channels)


def test_zero_crossfade_is_identity() -> None:
    x = noise(1000)
    assert np.array_equal(make_loop(x, SR, 0), x)


def test_keeps_dtype() -> None:
    x = noise(2000).astype(np.float32)
    assert make_loop(x, SR, 100).dtype == np.float32


def test_too_long_crossfade_fails() -> None:
    with pytest.raises(ValueError, match="não cabe"):
        make_loop(noise(1000), SR, 600)  # fade 600 > n/2


def test_seam_is_continuous() -> None:
    """Sem crossfade a emenda é um salto aleatório; com crossfade vira um passo normal."""
    x = np.cumsum(
        np.random.default_rng(1).normal(0, 0.001, (6000, 1)), axis=0
    )  # sinal suave
    normal_step = np.abs(np.diff(x[:, 0])).mean()
    raw_jump = abs(x[-1, 0] - x[0, 0])
    out = make_loop(x, SR, 500)
    seam_jump = abs(out[-1, 0] - out[0, 0])
    assert raw_jump > 20 * normal_step  # o original NÃO emenda
    assert seam_jump < 5 * normal_step  # o loop emenda


def test_equal_power_keeps_level_for_uncorrelated_noise() -> None:
    """Dois trechos independentes: o nível na região do crossfade fica igual ao do resto."""
    x = noise(200_000, 1, seed=3)
    fade = 40_000
    out = make_loop(x, 1000, 40_000)  # sr=1000 → 40000 ms = 40000 amostras

    def rms(a: np.ndarray) -> float:
        return float(np.sqrt(np.mean(a**2)))

    assert rms(out[:fade]) == pytest.approx(rms(out[fade:]), rel=0.03)
