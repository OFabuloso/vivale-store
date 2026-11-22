/**
 * Ponto de entrada da escolha de contato (contato.html).
 * Deve ser o último script carregado: depende de dados, lógica e telas.
 */
(async function (raiz) {
  'use strict';

  raiz.Loja.armazenamento.inicializar();
  // Busca os atendentes ligados agora no servidor; sem servidor, usa os guardados
  await raiz.Loja.api.sincronizarCatalogo();
  raiz.Loja.telaContato.iniciar();
})(window);
