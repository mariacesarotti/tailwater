import numpy as np
import pyloudnorm as pyln


def normalize_loudness(
    samples: np.ndarray,
    sample_rate: int,
    target_lufs: float,
    peak_ceiling_db: float,
) -> np.ndarray:
    """Ajusta o áudio para que o loudness integrado chegue em target_lufs,
    sem deixar o pico passar de peak_ceiling_db.

    Se o teto impedir de chegar ao alvo, o teto vence e o áudio fica mais
    baixo que o alvo. Áudio sem nada para medir (mudo) volta como está.
    Áudio com menos de 0,4 s levanta ValueError (vem do pyloudnorm).
    """
    ceiling = 10 ** (peak_ceiling_db / 20)
    peak = float(np.max(np.abs(samples), initial=0.0))
    loudness = float(pyln.Meter(sample_rate).integrated_loudness(samples))
    if peak == 0 or not np.isfinite(loudness):
        return samples
    gain_db = target_lufs - loudness
    wanted_gain = 10 ** (gain_db / 20)
    max_gain = ceiling / peak
    gain = min(wanted_gain, max_gain)
    return (samples * gain).astype(samples.dtype)
