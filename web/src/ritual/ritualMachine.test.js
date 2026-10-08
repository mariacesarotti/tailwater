import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createActor } from 'xstate';
import { ritualMachine, PRETO_MS, T_RESPIRO_MS } from './ritualMachine.js';

const iniciar = (machine = ritualMachine) => createActor(machine).start();

const enviar = (ator, ...tipos) =>
  tipos.forEach((t) => ator.send(typeof t === 'string' ? { type: t } : t));

function ateEsperandoLama(ator) {
  enviar(ator, 'ASSETS_PRONTOS', 'ENTRAR');
  vi.advanceTimersByTime(PRETO_MS);
  enviar(ator, 'ANIMACAO_TERMINOU');
}

function ateMoldando(ator, texto = 'medo') {
  ateEsperandoLama(ator);
  enviar(ator, 'CLIQUE_LAMA', { type: 'CONFIRMAR', texto });
}

const em = (ator, estado) => ator.getSnapshot().matches(estado);

describe('ritualMachine', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  describe('carregamento', () => {
    it('começa em Carregando', () => {
      expect(iniciar().getSnapshot().value).toBe('Carregando');
    });

    it('ignora ENTRAR enquanto carrega', () => {
      const ator = iniciar();
      enviar(ator, 'ENTRAR');
      expect(em(ator, 'Carregando')).toBe(true);
    });

    it('ASSETS_PRONTOS leva a Pronto', () => {
      const ator = iniciar();
      enviar(ator, 'ASSETS_PRONTOS');
      expect(em(ator, 'Pronto')).toBe(true);
    });

    it('FALHA_CARREGAMENTO leva a Erro e o ator termina', () => {
      const ator = iniciar();
      enviar(ator, 'FALHA_CARREGAMENTO');
      expect(em(ator, 'Erro')).toBe(true);
      expect(ator.getSnapshot().status).toBe('done');
    });
  });

  describe('chegada', () => {
    it('inicia a ambiência ao entrar', () => {
      const iniciarAmbiencia = vi.fn();
      const ator = iniciar(ritualMachine.provide({ actions: { iniciarAmbiencia } }));
      enviar(ator, 'ASSETS_PRONTOS', 'ENTRAR');
      expect(iniciarAmbiencia).toHaveBeenCalledOnce();
    });

    it('fica no preto até PRETO_MS e então abre os olhos', () => {
      const ator = iniciar();
      enviar(ator, 'ASSETS_PRONTOS', 'ENTRAR');

      vi.advanceTimersByTime(PRETO_MS - 1);
      expect(em(ator, { Chegada: 'SomNoPreto' })).toBe(true);

      vi.advanceTimersByTime(1);
      expect(em(ator, { Chegada: 'OlhosAbrindo' })).toBe(true);
    });

    it('fim da animação dos olhos leva a EsperandoLama', () => {
      const ator = iniciar();
      ateEsperandoLama(ator);
      expect(em(ator, 'EsperandoLama')).toBe(true);
    });
  });

  describe('esperando a lama', () => {
    it('CLIQUE_LAMA leva a Nomeando', () => {
      const ator = iniciar();
      ateEsperandoLama(ator);
      enviar(ator, 'CLIQUE_LAMA');
      expect(em(ator, 'Nomeando')).toBe(true);
    });

    it('HORARIO_MUDOU aplica o horário e continua no mesmo estado', () => {
      const aplicarHorario = vi.fn();
      const ator = iniciar(ritualMachine.provide({ actions: { aplicarHorario } }));
      ateEsperandoLama(ator);
      enviar(ator, { type: 'HORARIO_MUDOU', horario: 'tarde' });
      expect(aplicarHorario).toHaveBeenCalledOnce();
      expect(em(ator, 'EsperandoLama')).toBe(true);
    });
  });

  describe('nomeando', () => {
    it('CANCELAR volta para EsperandoLama', () => {
      const ator = iniciar();
      ateEsperandoLama(ator);
      enviar(ator, 'CLIQUE_LAMA', 'CANCELAR');
      expect(em(ator, 'EsperandoLama')).toBe(true);
    });

    it.each(['', '   ', '\n\t'])('CONFIRMAR com %j não sai de Nomeando', (texto) => {
      const ator = iniciar();
      ateEsperandoLama(ator);
      enviar(ator, 'CLIQUE_LAMA', { type: 'CONFIRMAR', texto });
      expect(em(ator, 'Nomeando')).toBe(true);
    });

    it('CONFIRMAR com texto leva a Moldando e guarda a palavra sem espaços nas pontas', () => {
      const ator = iniciar();
      ateEsperandoLama(ator);
      enviar(ator, 'CLIQUE_LAMA', { type: 'CONFIRMAR', texto: '  medo  ' });
      expect(em(ator, 'Moldando')).toBe(true);
      expect(ator.getSnapshot().context.palavra).toBe('medo');
    });
  });

  describe('moldando', () => {
    it.each(['CANCELAR', 'CLIQUE_LAMA', 'HORARIO_MUDOU'])('ignora %s', (tipo) => {
      const ator = iniciar();
      ateMoldando(ator);
      enviar(ator, tipo);
      expect(em(ator, 'Moldando')).toBe(true);
    });

    it('FINALIZAR_MOLDE congela a malha e começa a cair', () => {
      const congelarMalha = vi.fn();
      const ator = iniciar(ritualMachine.provide({ actions: { congelarMalha } }));
      ateMoldando(ator);
      enviar(ator, 'FINALIZAR_MOLDE');
      expect(congelarMalha).toHaveBeenCalledOnce();
      expect(em(ator, { Soltando: 'Caindo' })).toBe(true);
    });
  });

  describe('soltando e respiro', () => {
    it('POTE_TOCOU_AGUA leva a Dissolvendo, com a palavra ainda viva', () => {
      const ator = iniciar();
      ateMoldando(ator);
      enviar(ator, 'FINALIZAR_MOLDE', 'POTE_TOCOU_AGUA');
      expect(em(ator, { Soltando: 'Dissolvendo' })).toBe(true);
      expect(ator.getSnapshot().context.palavra).toBe('medo');
    });

    it('fim da dissolução leva a Respiro e apaga a palavra', () => {
      const ator = iniciar();
      ateMoldando(ator);
      enviar(ator, 'FINALIZAR_MOLDE', 'POTE_TOCOU_AGUA', 'ANIMACAO_TERMINOU');
      expect(em(ator, 'Respiro')).toBe(true);
      expect(ator.getSnapshot().context.palavra).toBe('');
    });

    it('depois de T_RESPIRO volta para EsperandoLama', () => {
      const ator = iniciar();
      ateMoldando(ator);
      enviar(ator, 'FINALIZAR_MOLDE', 'POTE_TOCOU_AGUA', 'ANIMACAO_TERMINOU');

      vi.advanceTimersByTime(T_RESPIRO_MS - 1);
      expect(em(ator, 'Respiro')).toBe(true);

      vi.advanceTimersByTime(1);
      expect(em(ator, 'EsperandoLama')).toBe(true);
    });

    it('o ciclo pode recomeçar com outra palavra', () => {
      const ator = iniciar();
      ateMoldando(ator, 'medo');
      enviar(ator, 'FINALIZAR_MOLDE', 'POTE_TOCOU_AGUA', 'ANIMACAO_TERMINOU');
      vi.advanceTimersByTime(T_RESPIRO_MS);
      enviar(ator, 'CLIQUE_LAMA', { type: 'CONFIRMAR', texto: 'cansaço' });
      expect(em(ator, 'Moldando')).toBe(true);
      expect(ator.getSnapshot().context.palavra).toBe('cansaço');
    });
  });
});
