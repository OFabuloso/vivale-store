/**
 * Prepara as fotos escolhidas no painel antes do envio ao servidor:
 * reduz fotos grandes de celular, o que deixa o envio rápido e abaixo do limite de 8 MB.
 * O servidor ainda redesenha a foto e gera as versões leves usadas na loja.
 */
(function (raiz) {
  'use strict';

  const LARGURA_MAXIMA = 2000;
  const QUALIDADE_JPEG = 0.9;

  function carregarImagem(arquivo) {
    return new Promise((resolver, rejeitar) => {
      const endereco = URL.createObjectURL(arquivo);
      const imagem = new Image();
      imagem.onload = () => {
        URL.revokeObjectURL(endereco);
        resolver(imagem);
      };
      imagem.onerror = () => {
        URL.revokeObjectURL(endereco);
        rejeitar(new Error('O arquivo enviado não é uma imagem válida.'));
      };
      imagem.src = endereco;
    });
  }

  /** Recebe o arquivo escolhido e devolve um JPEG (Blob) de no máximo 2000 px de largura. */
  async function reduzirParaEnvio(arquivo) {
    const imagem = await carregarImagem(arquivo);
    const escala = Math.min(1, LARGURA_MAXIMA / imagem.naturalWidth);
    const tela = document.createElement('canvas');
    tela.width = Math.round(imagem.naturalWidth * escala);
    tela.height = Math.round(imagem.naturalHeight * escala);

    const contexto = tela.getContext('2d');
    contexto.fillStyle = '#ffffff'; // fundo branco para PNGs com transparência
    contexto.fillRect(0, 0, tela.width, tela.height);
    contexto.drawImage(imagem, 0, 0, tela.width, tela.height);
    return new Promise((resolver, rejeitar) => {
      tela.toBlob(
        (arquivoReduzido) =>
          arquivoReduzido ? resolver(arquivoReduzido) : rejeitar(new Error('Não foi possível preparar a foto.')),
        'image/jpeg',
        QUALIDADE_JPEG,
      );
    });
  }

  raiz.Loja = raiz.Loja || {};
  raiz.Loja.imagem = { reduzirParaEnvio };
})(window);
