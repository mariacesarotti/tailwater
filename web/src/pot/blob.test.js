import { describe, it, expect } from 'vitest';
import { BufferGeometry, Vector3 } from 'three';
import { createBlobGeometry } from './blob.js';

const LOW_DETAIL = 4;
const PROTOTYPE = { noiseAmplitude: 0.15, squashY: 0.8, floorY: -0.6 };
const noNoise = () => 0;
const fakeNoise = (x, y, z) => Math.sin(x * 5) * Math.cos(y * 3 + z);
const NEUTRAL = {
  detail: LOW_DETAIL,
  noise3D: noNoise,
  noiseAmplitude: PROTOTYPE.noiseAmplitude,
  squashY: 1,
  floorY: -Infinity,
};

const EPSILON = 1e-6;

function readVertices(geometry) {
  const position = geometry.getAttribute('position');
  const vertices = [];

  for (let i = 0; i < position.count; i++) {
    vertices.push(new Vector3().fromBufferAttribute(position, i));
  }

  return vertices;
}

describe('createBlobGeometry', () => {

  describe('estrutura da malha', () => {

    it('devolve uma BufferGeometry', () => {
      const geometry = createBlobGeometry(NEUTRAL);

      expect(geometry).toBeInstanceOf(BufferGeometry);
    });

    it('é indexada e sem vértices duplicados, pra malha não rasgar ao esculpir', () => {
      const geometry = createBlobGeometry(NEUTRAL);

      const keys = readVertices(geometry).map(
        (v) => `${v.x.toFixed(5)},${v.y.toFixed(5)},${v.z.toFixed(5)}`
      );

      expect(geometry.index).not.toBeNull();
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('tem uma normal calculada por vértice', () => {
      const geometry = createBlobGeometry(NEUTRAL);
      const normal = geometry.getAttribute('normal');

      expect(normal).toBeDefined();
      expect(normal.count).toBe(geometry.getAttribute('position').count);
    });

    it('não carrega UV, porque o blob não usa textura mapeada', () => {
      const geometry = createBlobGeometry(NEUTRAL);

      expect(geometry.getAttribute('uv')).toBeUndefined();
    });

  });

  describe('deformação por noise', () => {

    it('sem noise, todo vértice fica no raio 1 (esfera base intacta)', () => {
      const vertices = readVertices(createBlobGeometry(NEUTRAL));

      for (const v of vertices) {
        expect(v.length()).toBeCloseTo(1, 5);
      }
    });

    it('noise positivo empurra o vértice pra fora na proporção da amplitude', () => {
      const geometry = createBlobGeometry({ ...NEUTRAL, noise3D: () => 1 });

      for (const v of readVertices(geometry)) {
        expect(v.length()).toBeCloseTo(1.15, 5);
      }
    });

    it('noise negativo puxa o vértice pra dentro', () => {
      const geometry = createBlobGeometry({ ...NEUTRAL, noise3D: () => -1 });

      // raio = 1 + (-1) * 0.15
      for (const v of readVertices(geometry)) {
        expect(v.length()).toBeCloseTo(0.85, 5);
      }
    });

    it('a amplitude controla o quanto o noise deforma', () => {
      const geometry = createBlobGeometry({ ...NEUTRAL, noise3D: () => 1, noiseAmplitude: 0.5 });

      for (const v of readVertices(geometry)) {
        expect(v.length()).toBeCloseTo(1.5, 5);
      }
    });

    it('é determinística: o mesmo noise gera exatamente a mesma malha', () => {
      const first = createBlobGeometry({ ...NEUTRAL, noise3D: fakeNoise });
      const second = createBlobGeometry({ ...NEUTRAL, noise3D: fakeNoise });

      expect(first.getAttribute('position').array)
        .toEqual(second.getAttribute('position').array);
    });

  });

  describe('achatamento vertical', () => {

    it('multiplica só a altura (y) pelo squashY, sem mexer em x e z', () => {
      const tall = readVertices(createBlobGeometry({ ...NEUTRAL, noise3D: fakeNoise }));
      const squashed = readVertices(
        createBlobGeometry({ ...NEUTRAL, noise3D: fakeNoise, squashY: 0.8 })
      );

      expect(squashed).toHaveLength(tall.length);

      squashed.forEach((v, i) => {
        expect(v.y).toBeCloseTo(tall[i].y * 0.8, 5);
        expect(v.x).toBeCloseTo(tall[i].x, 5);
        expect(v.z).toBeCloseTo(tall[i].z, 5);
      });
    });

  });

  describe('piso', () => {

    const SQUASHED = { ...NEUTRAL, noise3D: fakeNoise, squashY: PROTOTYPE.squashY };

    it('nenhum vértice fica abaixo de floorY', () => {
      const vertices = readVertices(
        createBlobGeometry({ ...SQUASHED, floorY: PROTOTYPE.floorY })
      );
      const lowest = Math.min(...vertices.map((v) => v.y));

      expect(lowest).toBeGreaterThanOrEqual(PROTOTYPE.floorY - EPSILON);
    });

    it('achata a base: quem passaria do piso fica exatamente nele, o resto não se move', () => {
      const withoutFloor = readVertices(createBlobGeometry(SQUASHED));
      const withFloor = readVertices(
        createBlobGeometry({ ...SQUASHED, floorY: PROTOTYPE.floorY })
      );

      let clampedCount = 0;

      withFloor.forEach((v, i) => {
        const original = withoutFloor[i];

        if (original.y < PROTOTYPE.floorY) {
          expect(v.y).toBeCloseTo(PROTOTYPE.floorY, 5);
          clampedCount++;
        } else {
          expect(v.y).toBeCloseTo(original.y, 5);
        }

        expect(v.x).toBeCloseTo(original.x, 5);
        expect(v.z).toBeCloseTo(original.z, 5);
      });

      expect(clampedCount).toBeGreaterThan(0);
    });

  });

  describe('valores padrão', () => {

    it('sem opções de forma, usa achatamento e piso do protótipo', () => {
      const ys = readVertices(
        createBlobGeometry({ noise3D: noNoise, detail: LOW_DETAIL })
      ).map((v) => v.y);

      expect(Math.min(...ys)).toBeCloseTo(PROTOTYPE.floorY, 5);

      expect(Math.max(...ys)).toBeLessThanOrEqual(PROTOTYPE.squashY + EPSILON);
    });

  });

});