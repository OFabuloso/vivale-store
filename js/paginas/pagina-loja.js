/**
 * Ponto de entrada da loja (index.html).
 * Deve ser o último script carregado: depende de dados, lógica e telas.
 */
(async function (raiz) {
  'use strict';

  raiz.Loja.armazenamento.inicializar();
  // Busca o catálogo atual no servidor; sem servidor, segue com o catálogo guardado
  await raiz.Loja.api.sincronizarCatalogo();
  raiz.Loja.telaCarrinho.iniciar();
  raiz.Loja.visualizadorFoto.iniciar();
  raiz.Loja.telaCatalogo.iniciar();
})(window);
