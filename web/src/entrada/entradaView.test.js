// web/src/entrada/entradaView.test.js
import { describe, it, expect } from 'vitest';
import { createActor } from 'xstate';
import { ritualMachine } from '../ritual/ritualMachine.js';
import { getEntradaView, MENSAGEM_ERRO } from './entradaView.js';

function snapshotApos(...tipos) {
  const ator = createActor(ritualMachine).start();
  tipos.forEach((type) => ator.send({ type }));
  const snapshot = ator.getSnapshot();
  ator.stop();
  return snapshot;
}

describe('getEntradaView', () => {
  it.each([
    {
      caso: 'Carregando',
      eventos: [],
      esperado: { visivel: true, botaoAtivo: false, rotulo: 'carregando…', erro: null },
    },
    {
      caso: 'Pronto',
      eventos: ['ASSETS_PRONTOS'],
      esperado: { visivel: true, botaoAtivo: true, rotulo: 'entrar', erro: null },
    },
    {
      caso: 'Erro',
      eventos: ['FALHA_CARREGAMENTO'],
      esperado: { visivel: true, botaoAtivo: false, rotulo: null, erro: MENSAGEM_ERRO },
    },
    {
      caso: 'Chegada (qualquer outro)',
      eventos: ['ASSETS_PRONTOS', 'ENTRAR'],
      esperado: { visivel: false, botaoAtivo: false, rotulo: null, erro: null },
    },
  ])('$caso', ({ eventos, esperado }) => {
    expect(getEntradaView(snapshotApos(...eventos))).toEqual(esperado);
  });
});