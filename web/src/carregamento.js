import { initAudio } from './audio/audio.js';

// Os gatos (GLB) entram aqui depois, junto com o áudio, via Promise.all.
export function carregarTudo() {
  return initAudio();
}
