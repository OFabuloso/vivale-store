/**
 * Funções utilitárias compartilhadas (formatação, sanitização, cores).
 * Funciona no navegador (window.Loja.utilidades) e no Node (module.exports) para os testes.
 */
(function (raiz) {
  'use strict';

  const formatadorReal = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  /** Converte reais para centavos inteiros, evitando erros de ponto flutuante nas somas. */
  function paraCentavos(valorEmReais) {
    return Math.round(Number(valorEmReais) * 100);
  }

  /** Formata um valor em reais como "R$ 1.234,56" (troca o espaço inseparável do Intl por espaço comum). */
  function formatarMoeda(valorEmReais) {
    return formatadorReal.format(Number(valorEmReais) || 0).replace(/ /g, ' ');
  }

  /** Converte textos como "1.234,56", "1.500", "65,00" ou "65.5" em número. Retorna NaN se inválido. */
  function lerValorMonetario(texto) {
    const textoLimpo = String(texto).replace(/[^\d,.-]/g, '').trim();
    if (!textoLimpo) return NaN;
    const possuiVirgula = textoLimpo.includes(',');
    // Sem vírgula, pontos em grupos de 3 dígitos ("1.500") são separador de milhar, não decimal
    const pontoEhMilhar = !possuiVirgula && /^-?\d{1,3}(\.\d{3})+$/.test(textoLimpo);
    const textoNormalizado = possuiVirgula
      ? textoLimpo.replace(/\./g, '').replace(',', '.')
      : pontoEhMilhar
        ? textoLimpo.replace(/\./g, '')
        : textoLimpo;
    return Number(textoNormalizado);
  }

  /**
   * Mantém apenas os dígitos do telefone e adiciona o DDI 55 (Brasil)
   * quando o número vier só com DDD + número (10 ou 11 dígitos).
   */
  function normalizarTelefone(telefone) {
    const apenasDigitos = String(telefone || '').replace(/\D/g, '');
    if (apenasDigitos.length === 10 || apenasDigitos.length === 11) {
      return `55${apenasDigitos}`;
    }
    return apenasDigitos;
  }

  /** Escapa caracteres especiais antes de inserir textos do usuário no HTML. */
  function escaparHtml(texto) {
    return String(texto ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Gera um identificador único simples para produtos. */
  function gerarId() {
    const parteTempo = Date.now().toString(36);
    const parteAleatoria = Math.random().toString(36).slice(2, 8);
    return `prd-${parteTempo}-${parteAleatoria}`;
  }

  /** Remove acentos e padroniza para comparação de textos. */
  function normalizarTexto(texto) {
    return String(texto || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();
  }

  // Cores comuns no mercado de moda, usadas para desenhar as bolinhas de cor nos filtros
  const MAPA_CORES = {
    preto: '#1f1f1f',
    branco: '#ffffff',
    'off white': '#f3eee4',
    nude: '#e3c4a8',
    bege: '#d9c3a5',
    caramelo: '#b07a45',
    marrom: '#6b4632',
    chocolate: '#4e3226',
    'verde militar': '#5b6142',
    'verde oliva': '#7a7a48',
    'verde menta': '#b7dcc8',
    verde: '#4f7a5a',
    'rosa bebe': '#f4cfd6',
    rosa: '#e7a1b0',
    'rosa antigo': '#c99198',
    pink: '#e0457b',
    vermelho: '#b3282d',
    vinho: '#6d1f2f',
    terracota: '#b5654a',
    laranja: '#e38542',
    mostarda: '#d2a23a',
    amarelo: '#f1d36b',
    azul: '#3f63a8',
    'azul marinho': '#1f2a44',
    'azul serenity': '#a9c1e0',
    jeans: '#5b7aa0',
    lilas: '#c2a8d6',
    roxo: '#6a3f8f',
    cinza: '#9a9a9a',
    'cinza mescla': '#b9b9b9',
    chumbo: '#4a4a4a',
    dourado: '#c9a54b',
    prata: '#c0c0c0',
  };

  /** Retorna o código hexadecimal de uma cor pelo nome (ou um tom neutro se não for conhecida). */
  function obterHexDaCor(nomeCor) {
    return MAPA_CORES[normalizarTexto(nomeCor)] || '#cbbfb4';
  }

  /** Gera uma imagem SVG elegante para produtos sem foto. */
  function gerarImagemPlaceholder(nomeProduto, nomeCor) {
    const corFundo = obterHexDaCor(nomeCor);
    const inicial = escaparHtml(String(nomeProduto || '?').trim().charAt(0).toUpperCase());
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="${corFundo}" stop-opacity="0.35"/>` +
      `<stop offset="1" stop-color="${corFundo}" stop-opacity="0.75"/>` +
      `</linearGradient></defs>` +
      `<rect width="300" height="400" fill="#f6f1ec"/>` +
      `<rect width="300" height="400" fill="url(#g)"/>` +
      `<text x="150" y="225" text-anchor="middle" font-family="Georgia,serif" ` +
      `font-size="120" fill="#ffffff" fill-opacity="0.85">${inicial}</text>` +
      `</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  const api = {
    paraCentavos,
    formatarMoeda,
    lerValorMonetario,
    normalizarTelefone,
    escaparHtml,
    gerarId,
    normalizarTexto,
    obterHexDaCor,
    gerarImagemPlaceholder,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    raiz.Loja = raiz.Loja || {};
    raiz.Loja.utilidades = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
