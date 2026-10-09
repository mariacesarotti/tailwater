export const MENSAGEM_ERRO = 'Algo deu errado por aqui. Tenta recarregar a página.';

// Uma linha por estado em que a tela de entrada aparece.
const VIEWS = {
  Carregando: { visivel: true, botaoAtivo: false, rotulo: 'carregando…', erro: null },
  Pronto:     { visivel: true, botaoAtivo: true,  rotulo: 'entrar',      erro: null },
  Erro:       { visivel: true, botaoAtivo: false, rotulo: null,          erro: MENSAGEM_ERRO },
};

// Qualquer outro estado: a tela de entrada já foi embora.
const ESCONDIDA = { visivel: false, botaoAtivo: false, rotulo: null, erro: null };

export function getEntradaView(snapshot) {
  const estado = Object.keys(VIEWS).find((nome) => snapshot.matches(nome));
  return estado ? VIEWS[estado] : ESCONDIDA;
}