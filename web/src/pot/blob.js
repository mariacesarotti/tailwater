import { IcosahedronGeometry, Vector3 } from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createNoise3D } from 'simplex-noise';

export function createBlobGeometry({
  noise3D = createNoise3D(),
  detail = 75,
  noiseAmplitude = 0.15,
  squashY = 0.8,
  floorY = -0.6,
} = {}) {

  let geometry = new IcosahedronGeometry(1, detail);
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  geometry = mergeVertices(geometry);

  const position = geometry.getAttribute('position');
  const vertex = new Vector3();

  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i);

    const noise = noise3D(vertex.x, vertex.y, vertex.z);
    vertex.multiplyScalar(1 + noise * noiseAmplitude);

    vertex.y *= squashY;
    if (vertex.y < floorY) vertex.y = floorY;

    position.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();

  return geometry;
}