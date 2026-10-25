/**
 * Cálculos do zoom da foto em tela cheia (pinça, arraste e toque duplo).
 * Sem acesso ao DOM, para poder ser testado no Node.
 */
(function (raiz) {
  'use strict';

  const ESCALA_MINIMA = 1;
  const ESCALA_MAXIMA = 4;
  // Ampliação aplicada pelo toque duplo
  const ESCALA_TOQUE_DUPLO = 2.5;

  /** Mantém a escala entre o tamanho original (1x) e o máximo permitido. */
  function limitarEscala(escala) {
    if (!Number.isFinite(escala)) return ESCALA_MINIMA;
    return Math.min(ESCALA_MAXIMA, Math.max(ESCALA_MINIMA, escala));
  }

  /** Distância em pixels entre dois dedos ({ x, y }). */
  function calcularDistancia(primeiroPonto, segundoPonto) {
    return Math.hypot(segundoPonto.x - primeiroPonto.x, segundoPonto.y - primeiroPonto.y);
  }

  /** Nova escala da pinça: cresce na mesma proporção em que os dedos se afastam. */
  function calcularEscalaDaPinca(escalaInicial, distanciaInicial, distanciaAtual) {
    if (distanciaInicial <= 0) return limitarEscala(escalaInicial);
    return limitarEscala(escalaInicial * (distanciaAtual / distanciaInicial));
  }

  /**
   * Impede que a foto ampliada seja arrastada para fora da área visível.
   * A foto pode andar no máximo metade do quanto ela passa da área; se ainda
   * cabe inteira (ex.: foto mais baixa que a tela), fica centralizada.
   * tamanhoDaImagem é o tamanho exibido sem zoom (igual à área quando omitido).
   */
  function limitarDeslocamento(deslocamento, escala, tamanhoDaArea, tamanhoDaImagem = tamanhoDaArea) {
    const deslocamentoMaximo = Math.max(0, (escala * tamanhoDaImagem - tamanhoDaArea) / 2);
    const deslocamentoLimitado = Math.min(deslocamentoMaximo, Math.max(-deslocamentoMaximo, deslocamento));
    // Evita "-0", que deixaria o transform com "translate(-0px, ...)"
    return deslocamentoLimitado === 0 ? 0 : deslocamentoLimitado;
  }

  /**
   * Tamanho em que a foto aparece dentro da área com "object-fit: contain"
   * (encaixada inteira, sem cortar). Todos os tamanhos são { largura, altura }.
   */
  function calcularTamanhoExibido(tamanhoOriginal, tamanhoDaArea) {
    if (!tamanhoOriginal.largura || !tamanhoOriginal.altura) return { ...tamanhoDaArea };
    const proporcao = Math.min(
      tamanhoDaArea.largura / tamanhoOriginal.largura,
      tamanhoDaArea.altura / tamanhoOriginal.altura,
    );
    return { largura: tamanhoOriginal.largura * proporcao, altura: tamanhoOriginal.altura * proporcao };
  }

  /**
   * Toque duplo: amplia mantendo o ponto tocado no mesmo lugar da tela, ou volta ao normal.
   * pontoTocado é relativo ao centro da área ({ x, y }); os tamanhos são { largura, altura }.
   */
  function alternarZoomDoToqueDuplo(escalaAtual, pontoTocado, tamanhoDaArea, tamanhoDaImagem = tamanhoDaArea) {
    if (escalaAtual > ESCALA_MINIMA) {
      return { escala: ESCALA_MINIMA, deslocamentoX: 0, deslocamentoY: 0 };
    }
    const escala = ESCALA_TOQUE_DUPLO;
    return {
      escala,
      deslocamentoX: limitarDeslocamento(
        -pontoTocado.x * (escala - 1),
        escala,
        tamanhoDaArea.largura,
        tamanhoDaImagem.largura,
      ),
      deslocamentoY: limitarDeslocamento(
        -pontoTocado.y * (escala - 1),
        escala,
        tamanhoDaArea.altura,
        tamanhoDaImagem.altura,
      ),
    };
  }

  const api = {
    ESCALA_MINIMA,
    ESCALA_MAXIMA,
    ESCALA_TOQUE_DUPLO,
    limitarEscala,
    calcularDistancia,
    calcularEscalaDaPinca,
    limitarDeslocamento,
    calcularTamanhoExibido,
    alternarZoomDoToqueDuplo,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    raiz.Loja = raiz.Loja || {};
    raiz.Loja.zoom = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
