/**
 * Carrega a seda animada só em aparelhos com mouse e para quem não pediu menos movimento.
 * Nos demais casos nada mais é baixado e o fundo continua sendo a imagem parada do CSS.
 */
(function () {
  'use strict';

  const temMouse = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const prefereMenosMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!temMouse || prefereMenosMovimento) return;

  ['js/logica/ondulacao.js', 'js/telas/seda-animada.js'].forEach((endereco) => {
    const elementoScript = document.createElement('script');
    elementoScript.src = endereco;
    // Mantém a ordem: a tela depende dos cálculos
    elementoScript.async = false;
    document.head.append(elementoScript);
  });
})();
