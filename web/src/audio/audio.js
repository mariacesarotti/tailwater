import { createThrottle } from '../pot/throttle.js';
import { pickSfxVariation } from '../pot/sfxVariation.js';
import { findAsset, formatOrder } from './manifest.js';

const ROOT = import.meta.env.BASE_URL + 'assets/generated/';
const AMBIENCE_ID = 'ambience-earlymorning'; // por enquanto só a manhã
const CLAY_IDS = ['clay1', 'clay2', 'clay3'];
const SFX_INTERVAL_MS = 150; // intervalo mínimo entre sons durante o arraste
const AMBIENCE_FADE_IN_S = 3;

const audioCtx = new AudioContext();
const clayBuffers = [];
const sfxThrottle = createThrottle(SFX_INTERVAL_MS);

let ambienceBuffer = null;
let ambienceSource = null;
let unlocked = false;

async function fetchBuffer(asset) {
  const problems = [];

  for (const format of formatOrder(asset.files)) {
    try {
      const response = await fetch(ROOT + asset.files[format]);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await audioCtx.decodeAudioData(await response.arrayBuffer());
    } catch (error) {
      problems.push(`${format}: ${error.message}`);
    }
  }

  throw new Error(`${asset.id}: ${problems.join(' | ')}`);
}

function startAmbienceIfReady() {
  if (!unlocked || ambienceBuffer === null || ambienceSource !== null) return;

  ambienceSource = audioCtx.createBufferSource();
  ambienceSource.buffer = ambienceBuffer;
  ambienceSource.loop = true;

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(1, audioCtx.currentTime + AMBIENCE_FADE_IN_S);

  ambienceSource.connect(gain).connect(audioCtx.destination);
  ambienceSource.start();
}

export async function initAudio() {
  const response = await fetch(ROOT + 'manifest.json');
  if (!response.ok) throw new Error(`manifest.json: HTTP ${response.status}`);
  const manifest = await response.json();

  const wanted = [AMBIENCE_ID, ...CLAY_IDS].map((id) => {
    const asset = findAsset(manifest, id);
    if (asset === undefined) return Promise.reject(new Error(`${id}: não está no manifest`));
    return fetchBuffer(asset);
  });

  const [ambience, ...clays] = await Promise.allSettled(wanted);

  if (ambience.status === 'fulfilled') {
    ambienceBuffer = ambience.value;
    startAmbienceIfReady();
  }

  for (const result of clays) {
    if (result.status === 'fulfilled') clayBuffers.push(result.value);
  }

  for (const result of [ambience, ...clays]) {
    if (result.status === 'rejected') console.warn('[audio]', result.reason.message);
  }
}

/** Chame dentro de um gesto (pointerdown). Pode ser chamada várias vezes. */
export function unlockAudio() {
  unlocked = true;
  audioCtx.resume().then(startAmbienceIfReady);
}

export function playClay(volume = 0.4, force = false) {
  if (clayBuffers.length === 0) return;
  if (sfxThrottle.tryFire({ force }) === false) return;

  const { buffer, playbackRate, gainFactor } = pickSfxVariation(clayBuffers);

  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = playbackRate;

  const gain = audioCtx.createGain();
  gain.gain.value = volume * gainFactor;

  source.connect(gain).connect(audioCtx.destination);
  source.start();
}
