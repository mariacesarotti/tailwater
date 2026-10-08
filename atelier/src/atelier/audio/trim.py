import numpy as np


def trim_silence(
    samples: np.ndarray,
    sample_rate: int,
    threshold_db: float,
    margin_ms: float,
) -> np.ndarray:
    """Corta o silêncio do começo e do fim, deixando uma margem.

    Um sample conta como som se QUALQUER canal chega ao limiar (em dBFS).
    A margem (em ms) é mantida antes do primeiro som e depois do último,
    sem passar das pontas do áudio.
    Se o áudio inteiro é silêncio, devolve um array vazio (mesmos canais).
    """
    threshold = 10 ** (threshold_db / 20)
    margin = round(sample_rate * margin_ms / 1000)
    channel_axes = tuple(range(1, samples.ndim))
    amplitude = np.abs(samples).max(axis=channel_axes, initial=0.0)
    loud = np.flatnonzero(amplitude >= threshold)
    if loud.size == 0:
        return samples[:0]
    start = max(loud[0] - margin, 0)
    end = min(loud[-1] + 1 + margin, samples.shape[0])
    return samples[start:end]
