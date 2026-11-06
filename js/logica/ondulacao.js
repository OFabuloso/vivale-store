/**
 * Cálculos da seda animada: ondas deixadas pelo mouse e brilho que o acompanha.
 * Sem acesso ao DOM, para poder ser testado no Node.
 * As posições vão de 0 a 1 na largura e na altura da tela.
 */
(function (raiz) {
  'use strict';

  const MAXIMO_DE_ONDAS = 6;
  const DURACAO_DA_ONDA_MS = 1800;
  const SUBIDA_DA_ONDA_MS = 180;
  const DURACAO_DO_BRILHO_MS = 1400;
  // Distância mínima entre ondas, como fração da altura da tela
  const DISTANCIA_ENTRE_ONDAS = 0.07;
  // Tempo de reação do brilho ao mouse: quanto maior, mais ele fica para trás
  const ATRASO_DO_BRILHO_MS = 120;

  /** Força da onda de 0 a 1: sobe rápido, depois some aos poucos até o fim da duração. */
  function calcularForcaDaOnda(idadeMs) {
    if (idadeMs <= 0 || idadeMs >= DURACAO_DA_ONDA_MS) return 0;
    if (idadeMs < SUBIDA_DA_ONDA_MS) return idadeMs / SUBIDA_DA_ONDA_MS;
    const restante = 1 - (idadeMs - SUBIDA_DA_ONDA_MS) / (DURACAO_DA_ONDA_MS - SUBIDA_DA_ONDA_MS);
    return restante * restante;
  }

  /** Intensidade do brilho de 0 a 1, enfraquecendo desde o último movimento do mouse. */
  function calcularIntensidadeDoBrilho(tempoParadoMs) {
    if (tempoParadoMs >= DURACAO_DO_BRILHO_MS) return 0;
    return 1 - Math.max(tempoParadoMs, 0) / DURACAO_DO_BRILHO_MS;
  }

  /**
   * Cria uma onda quando o mouse se afastou o bastante da anterior, mantendo só as mais recentes.
   * A proporção da tela evita que a distância conte mais em uma direção do que na outra.
   */
  function registrarOnda(ondas, posicao, instante, proporcaoDaTela) {
    const ultimaOnda = ondas[ondas.length - 1];
    if (ultimaOnda) {
      const distanciaHorizontal = (posicao.horizontal - ultimaOnda.horizontal) * proporcaoDaTela;
      const distanciaVertical = posicao.vertical - ultimaOnda.vertical;
      if (Math.hypot(distanciaHorizontal, distanciaVertical) < DISTANCIA_ENTRE_ONDAS) return ondas;
    }
    return [...ondas, { ...posicao, inicio: instante }].slice(-MAXIMO_DE_ONDAS);
  }

  function removerOndasExpiradas(ondas, instante) {
    return ondas.filter((onda) => instante - onda.inicio < DURACAO_DA_ONDA_MS);
  }

  /** A animação só continua enquanto houver algo visível: é o que a faz parar com o mouse parado. */
  function animacaoAindaAtiva(ondas, instante, ultimoMovimento) {
    return (
      removerOndasExpiradas(ondas, instante).length > 0 ||
      calcularIntensidadeDoBrilho(instante - ultimoMovimento) > 0
    );
  }

  /** Aproxima um valor do alvo no mesmo ritmo, seja qual for a taxa de quadros do computador. */
  function suavizarValor(valorAtual, valorAlvo, tempoDecorridoMs) {
    const aproximacao = 1 - Math.exp(-Math.max(tempoDecorridoMs, 0) / ATRASO_DO_BRILHO_MS);
    return valorAtual + (valorAlvo - valorAtual) * aproximacao;
  }

  /**
   * Fração da imagem visível em cada direção, igual ao "background-size: cover" do CSS:
   * a imagem cobre a tela inteira e o excesso é cortado por igual nos dois lados.
   */
  function calcularEscalaCover(larguraTela, alturaTela, larguraImagem, alturaImagem) {
    const proporcaoTela = larguraTela / alturaTela;
    const proporcaoImagem = larguraImagem / alturaImagem;
    if (proporcaoTela > proporcaoImagem) {
      return { horizontal: 1, vertical: proporcaoImagem / proporcaoTela };
    }
    return { horizontal: proporcaoTela / proporcaoImagem, vertical: 1 };
  }

  /** Identifica pelo nome quando o navegador desenha sem usar a placa de vídeo. */
  function renderizadorPorSoftware(nomeDoRenderizador) {
    return /swiftshader|llvmpipe|softpipe|software|basic render driver/i.test(String(nomeDoRenderizador || ''));
  }

  const api = {
    MAXIMO_DE_ONDAS,
    DURACAO_DA_ONDA_MS,
    DURACAO_DO_BRILHO_MS,
    DISTANCIA_ENTRE_ONDAS,
    calcularForcaDaOnda,
    calcularIntensidadeDoBrilho,
    registrarOnda,
    removerOndasExpiradas,
    animacaoAindaAtiva,
    suavizarValor,
    calcularEscalaCover,
    renderizadorPorSoftware,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    raiz.Loja = raiz.Loja || {};
    raiz.Loja.ondulacao = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
