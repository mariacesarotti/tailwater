import './style.css';
import { createActor } from 'xstate';
import { ritualMachine } from './ritual/ritualMachine.js';
import { getEntradaView, aplicarEntrada } from './entrada/entradaView.js';
import { unlockAudio } from './audio/audio.js';
import { carregarTudo } from './carregamento.js';

// unlockAudio roda síncrono dentro do clique, senão o navegador bloqueia o som
const ator = createActor(
  ritualMachine.provide({ actions: { iniciarAmbiencia: () => unlockAudio() } }),
);

const render = (snapshot) => aplicarEntrada(getEntradaView(snapshot));

ator.subscribe(render);
ator.start();
render(ator.getSnapshot());

document.getElementById('entrar').addEventListener('click', () => ator.send({ type: 'ENTRAR' }));

carregarTudo()
  .then(() => ator.send({ type: 'ASSETS_PRONTOS' }))
  .catch((motivo) => {
    console.error('[carregamento]', motivo);
    ator.send({ type: 'FALHA_CARREGAMENTO' });
  });
