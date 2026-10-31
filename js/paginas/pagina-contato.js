/**
 * Ponto de entrada da escolha de contato (contato.html).
 * Deve ser o último script carregado: depende de dados, lógica e telas.
 */
(function (raiz) {
  'use strict';

  raiz.Loja.armazenamento.inicializar();
  raiz.Loja.telaContato.iniciar();
})(window);
