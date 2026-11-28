/**
 * Comprovante de venda para impressora térmica de 58 mm (32 letras por linha).
 * Gera as linhas do comprovante, os comandos ESC/POS que essas impressoras entendem e o link
 * que entrega a impressão ao app RawBT no Android (ele fala com a impressora pelo Bluetooth).
 * O texto vai sem acentos: assim sai certo em qualquer impressora, seja qual for a tabela de
 * caracteres configurada nela.
 * Funciona no navegador (window.Loja.comprovante) e no Node (module.exports) para os testes.
 */
(function (raiz) {
  'use strict';

  const ambienteNode = typeof module !== 'undefined' && module.exports;
  const utilidades = ambienteNode ? require('./utilidades.js') : raiz.Loja.utilidades;

  const LARGURA_COMPROVANTE = 32;
  const RECUO_DOS_ITENS = '   ';
  const SEPARADOR = '-'.repeat(LARGURA_COMPROVANTE);
  // Endereço do RawBT no Chrome do Android (formato usado nos exemplos do próprio RawBT)
  const SUFIXO_LINK_RAWBT = '#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;';

  /** Tira acentos e troca o que a impressora não conhece (ex.: "Única" → "Unica"). */
  function paraTextoDaImpressora(texto) {
    return String(texto)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[º°]/g, 'o')
      .replace(/ª/g, 'a')
      .replace(/[  ]/g, ' ')
      .replace(/[^\x20-\x7e]/g, '?');
  }

  /** Quebra o texto em linhas da largura do papel, sem cortar palavras (a não ser as enormes). */
  function quebrarTexto(texto, largura, recuoDasContinuacoes = '') {
    const linhas = [];
    let linhaAtual = '';
    paraTextoDaImpressora(texto).split(/\s+/).filter(Boolean).forEach((palavra) => {
      const prefixo = linhas.length === 0 ? '' : recuoDasContinuacoes;
      const larguraDisponivel = largura - prefixo.length;
      let restoDaPalavra = palavra;
      while (restoDaPalavra.length > larguraDisponivel) {
        if (linhaAtual) {
          linhas.push(linhaAtual);
          linhaAtual = '';
        }
        linhas.push((linhas.length === 0 ? '' : recuoDasContinuacoes) + restoDaPalavra.slice(0, larguraDisponivel));
        restoDaPalavra = restoDaPalavra.slice(larguraDisponivel);
      }
      const candidata = linhaAtual ? `${linhaAtual} ${restoDaPalavra}` : `${linhas.length === 0 ? '' : recuoDasContinuacoes}${restoDaPalavra}`;
      if (candidata.length > largura) {
        linhas.push(linhaAtual);
        linhaAtual = recuoDasContinuacoes + restoDaPalavra;
      } else {
        linhaAtual = candidata;
      }
    });
    if (linhaAtual) linhas.push(linhaAtual);
    return linhas;
  }

  /** "TOTAL" à esquerda e "R$ 392,70" à direita na mesma linha. */
  function alinharNasPontas(esquerda, direita, largura = LARGURA_COMPROVANTE) {
    const textoEsquerda = paraTextoDaImpressora(esquerda);
    const textoDireita = paraTextoDaImpressora(direita);
    const espacos = Math.max(1, largura - textoEsquerda.length - textoDireita.length);
    return textoEsquerda + ' '.repeat(espacos) + textoDireita;
  }

  /** "2026-11-26 08:41:00" (do banco) → "26/11/2026 08:41". */
  function formatarDataDoBanco(dataDoBanco) {
    const partes = String(dataDoBanco || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    return partes ? `${partes[3]}/${partes[2]}/${partes[1]} ${partes[4]}:${partes[5]}` : '';
  }

  function linha(texto, estilo = {}) {
    return { texto: paraTextoDaImpressora(texto), ...estilo };
  }

  /**
   * "  M / Preto            R$ 130,90". Se tamanho e cor não couberem junto com o valor
   * (ex.: "Veste do 42 ao 49 / Preto e Branco"), quebram em linhas e o valor vai para a última.
   */
  function montarLinhasDaVariacao(item) {
    const variacao = `${RECUO_DOS_ITENS}${utilidades.rotularTamanho(item.tamanho)} / ${item.cor}`;
    const valor = utilidades.formatarMoeda(item.quantidade * item.preco);
    if (paraTextoDaImpressora(variacao).length + 1 + paraTextoDaImpressora(valor).length <= LARGURA_COMPROVANTE) {
      return [linha(alinharNasPontas(variacao, valor))];
    }
    return [
      // Todas as linhas com o recuo dos itens: quebra na largura que sobra depois dele
      ...quebrarTexto(variacao.trimStart(), LARGURA_COMPROVANTE - RECUO_DOS_ITENS.length).map((texto) => linha(RECUO_DOS_ITENS + texto)),
      linha(alinharNasPontas('', valor)),
    ];
  }

  /**
   * Linhas do comprovante, cada uma com { texto, centralizada?, negrito?, grande? }.
   * As mesmas linhas servem para a impressora (ESC/POS) e para a pré-visualização na tela.
   */
  function montarLinhasDoComprovante(pedido) {
    const totalPecas = pedido.itens.reduce((soma, item) => soma + item.quantidade, 0);
    const origem = pedido.origem === 'site' ? `Site${pedido.atendente ? ` (${pedido.atendente})` : ''}` : 'Balcao';
    const linhasDosItens = pedido.itens.flatMap((item) => [
      ...quebrarTexto(`${item.quantidade}x ${item.nome}`, LARGURA_COMPROVANTE, RECUO_DOS_ITENS).map((texto) => linha(texto)),
      ...montarLinhasDaVariacao(item),
    ]);

    return [
      linha('VIVALE STORE', { centralizada: true, negrito: true, grande: true }),
      linha('Moda feminina - Atacado', { centralizada: true }),
      linha(SEPARADOR),
      linha(alinharNasPontas(`Pedido no ${pedido.id}`, formatarDataDoBanco(pedido.finalizadoEm || pedido.criadoEm))),
      linha(`Origem: ${origem}`),
      ...(pedido.finalizadoPor ? quebrarTexto(`Vendedor: ${pedido.finalizadoPor}`, LARGURA_COMPROVANTE).map((texto) => linha(texto)) : []),
      linha(SEPARADOR),
      ...linhasDosItens,
      linha(SEPARADOR),
      linha(`Pecas: ${totalPecas}`),
      linha(alinharNasPontas('TOTAL', utilidades.formatarMoeda(pedido.total)), { negrito: true }),
      ...(pedido.formaPagamento ? [linha(`Pagamento: ${utilidades.rotularFormaDePagamento(pedido.formaPagamento)}`)] : []),
      ...(pedido.observacoes ? quebrarTexto(`Obs.: ${pedido.observacoes}`, LARGURA_COMPROVANTE).map((texto) => linha(texto)) : []),
      linha(SEPARADOR),
      linha('Nao e documento fiscal', { centralizada: true }),
      linha('Obrigado pela preferencia!', { centralizada: true }),
      linha('vivalestore.com.br', { centralizada: true }),
    ];
  }

  /** Texto para mostrar na tela (e na impressão pelo sistema), com as linhas centralizadas como no papel. */
  function montarTextoDaPrevia(linhas) {
    return linhas
      .map((linhaDoComprovante) => {
        if (!linhaDoComprovante.centralizada) return linhaDoComprovante.texto;
        const espacosAntes = Math.floor((LARGURA_COMPROVANTE - linhaDoComprovante.texto.length) / 2);
        return ' '.repeat(Math.max(0, espacosAntes)) + linhaDoComprovante.texto;
      })
      .join('\n');
  }

  // ---------- Comandos ESC/POS ----------

  const ESC = 0x1b;
  const GS = 0x1d;
  const NOVA_LINHA = 0x0a;

  /** Bytes que a impressora térmica entende: liga/desliga negrito, centraliza, aumenta, corta. */
  function gerarComandosEscPos(linhas) {
    const bytes = [ESC, 0x40]; // reinicia a impressora
    linhas.forEach((linhaDoComprovante) => {
      bytes.push(ESC, 0x61, linhaDoComprovante.centralizada ? 1 : 0);
      bytes.push(ESC, 0x45, linhaDoComprovante.negrito ? 1 : 0);
      bytes.push(GS, 0x21, linhaDoComprovante.grande ? 0x11 : 0x00); // altura e largura em dobro
      for (const letra of linhaDoComprovante.texto) bytes.push(letra.charCodeAt(0));
      bytes.push(NOVA_LINHA);
    });
    bytes.push(ESC, 0x61, 0, ESC, 0x45, 0, GS, 0x21, 0);
    bytes.push(ESC, 0x64, 4); // avança 4 linhas para destacar o papel
    bytes.push(GS, 0x56, 0x42, 0); // corta o papel (nas impressoras que têm guilhotina)
    return Uint8Array.from(bytes);
  }

  function paraBase64(bytes) {
    let binario = '';
    bytes.forEach((byte) => {
      binario += String.fromCharCode(byte);
    });
    return btoa(binario);
  }

  /** Link que o vendedor toca no Android para o RawBT imprimir o comprovante. */
  function montarLinkDeImpressaoRawBT(pedido) {
    return `intent:base64,${paraBase64(gerarComandosEscPos(montarLinhasDoComprovante(pedido)))}${SUFIXO_LINK_RAWBT}`;
  }

  const api = {
    LARGURA_COMPROVANTE,
    paraTextoDaImpressora,
    quebrarTexto,
    alinharNasPontas,
    formatarDataDoBanco,
    montarLinhasDoComprovante,
    montarTextoDaPrevia,
    gerarComandosEscPos,
    paraBase64,
    montarLinkDeImpressaoRawBT,
  };

  if (ambienteNode) {
    module.exports = api;
  } else {
    raiz.Loja = raiz.Loja || {};
    raiz.Loja.comprovante = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
