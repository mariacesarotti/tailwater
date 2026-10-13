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

let elementos = null;

function pegarElementos() {
  elementos ??= {
    tela: document.getElementById('entrada'),
    botao: document.getElementById('entrar'),
    erro: document.getElementById('entrada-erro'),
  };
  return elementos;
}

export function aplicarEntrada(view) {
  const { tela, botao, erro } = pegarElementos();

  if (!view.visivel) {
    esconder(tela);
    return;
  }

  botao.hidden = view.erro !== null;
  botao.disabled = !view.botaoAtivo;
  botao.textContent = view.rotulo ?? '';

  erro.hidden = view.erro === null;
  erro.textContent = view.erro ?? '';
}

function esconder(tela) {
  if (tela.classList.contains('saindo')) return;

  tela.classList.add('saindo');

  function aoTerminar(evento) {
    if (evento.target !== tela) return;
    tela.hidden = true;
    tela.removeEventListener('transitionend', aoTerminar);
  }

  tela.addEventListener('transitionend', aoTerminar);
}