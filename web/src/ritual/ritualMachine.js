import { setup, assign } from 'xstate';

export const PRETO_MS = 1000;
export const T_RESPIRO_MS = 4000;

export const ritualMachine = setup({
  delays: {
    PRETO: PRETO_MS,
    T_RESPIRO: T_RESPIRO_MS,
  },
  guards: {
    textoNaoVazio: ({ event }) =>
      typeof event.texto === 'string' && event.texto.trim().length > 0,
  },
  actions: {
    iniciarAmbiencia: () => {},
    aplicarHorario: () => {},
    congelarMalha: () => {},

    guardarPalavra: assign({ palavra: ({ event }) => event.texto.trim() }),
    limparPalavra: assign({ palavra: '' }),
  },
}).createMachine({
  id: 'ritual',
  initial: 'Carregando',
  context: { palavra: '' },
  states: {
    Carregando: {
      on: {
        ASSETS_PRONTOS: 'Pronto',
        FALHA_CARREGAMENTO: 'Erro',
      },
    },

    Erro: { type: 'final' },

    Pronto: {
      on: { ENTRAR: 'Chegada' },
    },

    Chegada: {
      initial: 'SomNoPreto',
      states: {
        SomNoPreto: {
          entry: 'iniciarAmbiencia',
          after: { PRETO: 'OlhosAbrindo' },
        },
        OlhosAbrindo: {
          on: { ANIMACAO_TERMINOU: 'Fim' },
        },
        Fim: { type: 'final' },
      },
      onDone: 'EsperandoLama',
    },

    EsperandoLama: {
      on: {
        CLIQUE_LAMA: 'Nomeando',
        HORARIO_MUDOU: { actions: 'aplicarHorario' },
      },
    },

    Nomeando: {
      on: {
        CANCELAR: 'EsperandoLama',
        CONFIRMAR: {
          guard: 'textoNaoVazio',
          target: 'Moldando',
          actions: 'guardarPalavra',
        },
      },
    },

    Moldando: {
      on: {
        FINALIZAR_MOLDE: { target: 'Soltando', actions: 'congelarMalha' },
      },
    },

    Soltando: {
      initial: 'Caindo',
      states: {
        Caindo: {
          on: { POTE_TOCOU_AGUA: 'Dissolvendo' },
        },
        Dissolvendo: {
          on: { ANIMACAO_TERMINOU: 'Fim' },
        },
        Fim: { type: 'final' },
      },
      onDone: 'Respiro',
    },

    Respiro: {
      entry: 'limparPalavra',
      after: { T_RESPIRO: 'EsperandoLama' },
    },
  },
});
