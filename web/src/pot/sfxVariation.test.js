import { describe, it, expect } from 'vitest';
import { pickSfxVariation } from './sfxVariation.js';

const buffers = ['clay1', 'clay2', 'clay3'];
const fixedRandom = (value) => () => value;
const ALMOST_ONE = 0.999999;

describe('pickSfxVariation', () => {

  it('devolve null quando ainda não há sons carregados', () => {
    expect(pickSfxVariation([], fixedRandom(0.5))).toBeNull();
  });

  it('com sorteio mínimo, escolhe o primeiro som', () => {
    const { buffer } = pickSfxVariation(buffers, fixedRandom(0));

    expect(buffer).toBe('clay1');
  });

  it('com sorteio máximo, escolhe o último som sem estourar o índice', () => {
    const { buffer } = pickSfxVariation(buffers, fixedRandom(ALMOST_ONE));

    expect(buffer).toBe('clay3');
  });

  it.each([0, 0.5, ALMOST_ONE])('com sorteio %s, playbackRate fica entre 0.9 e 1.1', (r) => {
    const { playbackRate } = pickSfxVariation(buffers, fixedRandom(r));

    expect(playbackRate).toBeGreaterThanOrEqual(0.9);
    expect(playbackRate).toBeLessThan(1.1);
  });

  it.each([0, 0.5, ALMOST_ONE])('com sorteio %s, gainFactor fica entre 0.8 e 1.2', (r) => {
    const { gainFactor } = pickSfxVariation(buffers, fixedRandom(r));

    expect(gainFactor).toBeGreaterThanOrEqual(0.8);
    expect(gainFactor).toBeLessThan(1.2);
  });

  it('o sorteio do meio dá a variação neutra (velocidade e volume originais)', () => {
    const { playbackRate, gainFactor } = pickSfxVariation(buffers, fixedRandom(0.5));

    expect(playbackRate).toBeCloseTo(1, 5);
    expect(gainFactor).toBeCloseTo(1, 5);
  });

});