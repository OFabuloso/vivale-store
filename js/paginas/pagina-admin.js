/**
 * Ponto de entrada do Painel do Vendedor (admin.html).
 * Deve ser o último script carregado: depende de dados, lógica e telas.
 */
(function (raiz) {
  'use strict';

  raiz.Loja.armazenamento.inicializar();
  raiz.Loja.telaAdmin.iniciar();
})(window);
