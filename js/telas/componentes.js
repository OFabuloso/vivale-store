/**
 * Pequenos componentes de interface reutilizados pelas telas (loja e admin).
 */
(function (raiz) {
  'use strict';

  const { gerarImagemPlaceholder } = raiz.Loja.utilidades;

  let temporizadorToast = null;

  /** Exibe uma mensagem curta no topo da tela. */
  function mostrarToast(mensagem) {
    let elementoToast = document.querySelector('.toast');
    if (!elementoToast) {
      elementoToast = document.createElement('div');
      elementoToast.className = 'toast';
      elementoToast.setAttribute('role', 'status');
      document.body.appendChild(elementoToast);
    }
    elementoToast.textContent = mensagem;
    clearTimeout(temporizadorToast);
    temporizadorToast = setTimeout(() => elementoToast.remove(), 2400);
  }

  /** Retorna a foto do produto ou uma imagem ilustrativa quando não houver foto. */
  function obterFotoProduto(produto) {
    if (produto && produto.foto) return produto.foto;
    return gerarImagemPlaceholder(produto ? produto.nome : '?', produto ? produto.cores[0] : '');
  }

  /** Troca por uma imagem ilustrativa caso o link da foto esteja quebrado. */
  function aplicarFotoComReserva(elementoImagem, produto) {
    elementoImagem.onerror = () => {
      elementoImagem.onerror = null;
      elementoImagem.src = gerarImagemPlaceholder(produto.nome, produto.cores[0]);
    };
    elementoImagem.src = obterFotoProduto(produto);
  }

  /** Fecha as janelas (dialog) ao clicar no "×" ou fora do conteúdo. */
  function configurarJanela(elementoJanela) {
    elementoJanela.addEventListener('click', (evento) => {
      const clicouNoFundo = evento.target === elementoJanela;
      const clicouEmFechar = evento.target.closest('[data-fechar]');
      if (clicouNoFundo || clicouEmFechar) elementoJanela.close();
    });
  }

  raiz.Loja = raiz.Loja || {};
  raiz.Loja.componentes = {
    mostrarToast,
    obterFotoProduto,
    aplicarFotoComReserva,
    configurarJanela,
  };
})(window);
