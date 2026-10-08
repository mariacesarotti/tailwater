import numpy as np


def make_loop(samples: np.ndarray, sample_rate: int, crossfade_ms: float) -> np.ndarray:
    """Faz o áudio emendar nele mesmo.

    As últimas `fade` amostras se misturam com as primeiras `fade`, e a saída
    fica `fade` amostras mais curta que a entrada (len(saída) = len(entrada) - fade).
    Na emenda, a última amostra da saída e a primeira são vizinhas no original.

    Com crossfade_ms = 0 devolve o áudio como está. Levanta ValueError se o
    crossfade não cabe duas vezes no áudio (começo e fim se sobreporiam).
    """
    fade = round(sample_rate * crossfade_ms / 1000)
    if fade == 0:
        return samples
    n = samples.shape[0]
    if 2 * fade > n:
        raise ValueError(
            f"crossfade de {fade} amostras não cabe em um áudio de {n} amostras"
        )

    t = np.linspace(0.0, 1.0, fade)
    shape = (fade,) + (1,) * (samples.ndim - 1)
    fade_in = np.sin(t * np.pi / 2).reshape(shape)
    fade_out = np.cos(t * np.pi / 2).reshape(shape)

    blend = samples[:fade] * fade_in + samples[n - fade :] * fade_out
    return np.concatenate([blend, samples[fade : n - fade]]).astype(samples.dtype)
