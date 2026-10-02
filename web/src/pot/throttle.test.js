import { describe, it, expect, beforeEach } from 'vitest';
import { createThrottle } from './throttle.js';

function createFakeClock(startMs = 0) {
  let current = startMs;

  return {
    now: () => current,
    set: (ms) => { current = ms; },
  };
}

const INTERVAL_MS = 150;

describe('createThrottle', () => {

  let clock;
  let throttle;

  beforeEach(() => {
    clock = createFakeClock();
    throttle = createThrottle(INTERVAL_MS, clock.now);
  });

  it('libera a primeira chamada, mesmo logo após a página carregar', () => {

    clock.set(10);

    expect(throttle.tryFire()).toBe(true);
  });

  it('bloqueia uma segunda chamada dentro do intervalo', () => {
    clock.set(1000);
    throttle.tryFire();

    clock.set(1100);

    expect(throttle.tryFire()).toBe(false);
  });

  it('libera de novo quando o intervalo completa exatamente', () => {
    clock.set(1000);
    throttle.tryFire();

    clock.set(1000 + INTERVAL_MS);

    expect(throttle.tryFire()).toBe(true);
  });

  it('chamada bloqueada não reinicia a janela', () => {
    clock.set(1000);
    throttle.tryFire();       // libera, janela começa em 1000

    clock.set(1100);
    throttle.tryFire();       // bloqueada, a janela tem que continuar em 1000

    clock.set(1150);

    expect(throttle.tryFire()).toBe(true);
  });

  it('force ignora o intervalo', () => {
    clock.set(1000);
    throttle.tryFire();

    clock.set(1010);

    expect(throttle.tryFire({ force: true })).toBe(true);
  });

  it('force também reinicia a janela', () => {
    clock.set(1000);
    throttle.tryFire();

    clock.set(1100);
    throttle.tryFire({ force: true });   // nova janela começa em 1100

    clock.set(1200);
    expect(throttle.tryFire()).toBe(false);

    clock.set(1250);
    expect(throttle.tryFire()).toBe(true);
  });

  it('cada instância tem seu próprio estado', () => {
    const other = createThrottle(INTERVAL_MS, clock.now);

    clock.set(1000);
    throttle.tryFire();

    clock.set(1010);

    expect(other.tryFire()).toBe(true);
  });

});