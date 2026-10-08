const PLAYBACK_RATE_MIN = 0.9;
const PLAYBACK_RATE_SPREAD = 0.2;

const GAIN_FACTOR_MIN = 0.8;
const GAIN_FACTOR_SPREAD = 0.4;

/**
 * Sorteia qual som tocar e com que variação de velocidade e volume.
 * Devolve null se ainda não há sons carregados.
 *
 * O random é injetável. No app usa Math.random; nos testes, um valor fixo.
 */
export function pickSfxVariation(buffers, random = Math.random) {
  if (buffers.length === 0) return null;

  const buffer = buffers[Math.floor(random() * buffers.length)];
  const playbackRate = PLAYBACK_RATE_MIN + random() * PLAYBACK_RATE_SPREAD;
  const gainFactor = GAIN_FACTOR_MIN + random() * GAIN_FACTOR_SPREAD;

  return { buffer, playbackRate, gainFactor };
}