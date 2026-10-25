/**
 * Conversão de fotos enviadas pelo Admin para Base64, já reduzidas,
 * para não estourar o limite do LocalStorage (cerca de 5 MB no total).
 */
(function (raiz) {
  'use strict';

  const LARGURA_MAXIMA = 800;
  const QUALIDADE_JPEG = 0.78;

  function carregarImagem(arquivo) {
    return new Promise((resolver, rejeitar) => {
      const leitor = new FileReader();
      leitor.onerror = () => rejeitar(new Error('Não foi possível ler o arquivo.'));
      leitor.onload = () => {
        const imagem = new Image();
        imagem.onload = () => resolver(imagem);
        imagem.onerror = () => rejeitar(new Error('O arquivo enviado não é uma imagem válida.'));
        imagem.src = leitor.result;
      };
      leitor.readAsDataURL(arquivo);
    });
  }

  /** Recebe um arquivo de imagem e devolve um Base64 JPEG redimensionado. */
  async function converterParaBase64Reduzido(arquivo) {
    const imagem = await carregarImagem(arquivo);
    const escala = Math.min(1, LARGURA_MAXIMA / imagem.width);
    const tela = document.createElement('canvas');
    tela.width = Math.round(imagem.width * escala);
    tela.height = Math.round(imagem.height * escala);

    const contexto = tela.getContext('2d');
    contexto.fillStyle = '#ffffff'; // fundo branco para PNGs com transparência
    contexto.fillRect(0, 0, tela.width, tela.height);
    contexto.drawImage(imagem, 0, 0, tela.width, tela.height);
    return tela.toDataURL('image/jpeg', QUALIDADE_JPEG);
  }

  raiz.Loja = raiz.Loja || {};
  raiz.Loja.imagem = { converterParaBase64Reduzido };
})(window);
