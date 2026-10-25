/**
 * Ponto de entrada da loja (index.html).
 * Deve ser o último script carregado: depende de dados, lógica e telas.
 */
(function (raiz) {
  'use strict';

  raiz.Loja.armazenamento.inicializar();
  raiz.Loja.telaCarrinho.iniciar();
  raiz.Loja.telaCatalogo.iniciar();
})(window);
