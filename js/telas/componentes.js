/**
 * Pequenos componentes de interface reutilizados pelas telas (loja e admin).
 */
(function (raiz) {
  'use strict';

  const { gerarImagemPlaceholder, montarSrcsetDaFoto } = raiz.Loja.utilidades;

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

  /**
   * Aplica a foto do produto. Com "tamanhosExibidos" (atributo "sizes"), usa as versões otimizadas.
   * Se elas faltarem, volta para a foto original; se esta também falhar, usa a imagem ilustrativa.
   */
  function aplicarFotoComReserva(elementoImagem, produto, tamanhosExibidos = '') {
    const fotoOriginal = obterFotoProduto(produto);
    const srcset = tamanhosExibidos ? montarSrcsetDaFoto(fotoOriginal) : '';

    elementoImagem.onerror = () => {
      if (elementoImagem.hasAttribute('srcset')) {
        elementoImagem.removeAttribute('srcset');
        elementoImagem.removeAttribute('sizes');
        elementoImagem.src = fotoOriginal;
        return;
      }
      elementoImagem.onerror = null;
      elementoImagem.src = gerarImagemPlaceholder(produto.nome, produto.cores[0]);
    };

    // O "sizes" vem antes do "srcset" para o navegador já escolher a versão certa
    if (srcset) {
      elementoImagem.sizes = tamanhosExibidos;
      elementoImagem.srcset = srcset;
    } else {
      elementoImagem.removeAttribute('srcset');
      elementoImagem.removeAttribute('sizes');
    }
    elementoImagem.src = fotoOriginal;
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
