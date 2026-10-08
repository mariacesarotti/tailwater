import { describe, expect, it } from 'vitest';
import { findAsset, formatOrder } from './manifest.js';

describe('formatOrder', () => {
  it('prefere ogg e depois m4a', () => {
    expect(formatOrder({ m4a: 'a.m4a', ogg: 'a.ogg' })).toEqual(['ogg', 'm4a']);
  });

  it('só devolve o que o asset realmente tem', () => {
    expect(formatOrder({ m4a: 'a.m4a' })).toEqual(['m4a']);
  });

  it('ignora formatos desconhecidos', () => {
    expect(formatOrder({ wav: 'a.wav' })).toEqual([]);
  });
});

describe('findAsset', () => {
  const manifest = { assets: [{ id: 'clay1' }, { id: 'clay2' }] };

  it('acha pelo id', () => {
    expect(findAsset(manifest, 'clay2')).toEqual({ id: 'clay2' });
  });

  it('devolve undefined quando o id não existe', () => {
    expect(findAsset(manifest, 'nope')).toBeUndefined();
  });
});
