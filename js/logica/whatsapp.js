/**
 * Geração da mensagem do pedido e do link do WhatsApp (https://wa.me/{NUMERO}?text={MENSAGEM}).
 */
(function (raiz) {
  'use strict';

  const ambienteNode = typeof module !== 'undefined' && module.exports;
  const utilidades = ambienteNode ? require('./utilidades.js') : raiz.Loja.utilidades;
  const carrinho = ambienteNode ? require('./carrinho.js') : raiz.Loja.carrinho;

  // No WhatsApp: *texto* = negrito (valores e quantidades), _texto_ = itálico (nomes de produtos)
  const negrito = (texto) => `*${texto}*`;
  const italico = (texto) => `_${texto}_`;

  /** Escolhe singular ou plural conforme a quantidade (ex.: "1 unidade", "3 unidades"). */
  function rotularQuantidade(quantidade, singular, plural) {
    return `${quantidade} ${quantidade === 1 ? singular : plural}`;
  }

  /** Monta a linha de um item: "- _Nome_ | Tamanho M | Cor Azul | *2 unidades* x *R$ 65,00*" (preço unitário). */
  function formatarLinhaItem(item) {
    const quantidade = negrito(rotularQuantidade(item.quantidade, 'unidade', 'unidades'));
    const precoUnitario = negrito(utilidades.formatarMoeda(item.preco));
    return `- ${italico(item.nome)} | Tamanho ${item.tamanho} | Cor ${item.cor} | ${quantidade} x ${precoUnitario}`;
  }

  /** Monta o bloco de observações; devolve lista vazia quando a cliente não escreveu nada. */
  function montarBlocoObservacoes(observacoes) {
    const textoObservacoes = String(observacoes || '').trim();
    if (!textoObservacoes) return [];
    return ['', 'Observações:', textoObservacoes];
  }

  /** Gera o texto completo do pedido: saudação, motivo, itens, resumo, observações e encerramento. */
  function gerarMensagemPedido(itens, observacoes = '') {
    const totalPecas = carrinho.contarPecas(itens);
    const valorTotal = carrinho.calcularTotal(itens);

    return [
      'Olá, equipe Vivale Store.',
      'Gostaria de finalizar o pedido no atacado que montei no site.',
      '',
      'Itens do pedido:',
      ...itens.map(formatarLinhaItem),
      '',
      'Resumo:',
      `- Total de peças: ${negrito(rotularQuantidade(totalPecas, 'peça', 'peças'))}`,
      `- Valor total: ${negrito(utilidades.formatarMoeda(valorTotal))}`,
      ...montarBlocoObservacoes(observacoes),
      '',
      'Por favor, confirme a disponibilidade do pedido e informe as condições de pagamento e o prazo de entrega.',
    ].join('\n');
  }

  /**
   * Recebe o número de destino, os itens do carrinho e as observações (opcionais)
   * e devolve a URL final do WhatsApp.
   * Lança erro se o número for inválido ou o carrinho estiver vazio.
   */
  function gerarLinkWhatsApp(numeroWhatsApp, itens, observacoes = '') {
    const numeroLimpo = utilidades.normalizarTelefone(numeroWhatsApp);
    if (numeroLimpo.length < 12) {
      throw new Error('Número de WhatsApp da loja não configurado corretamente.');
    }
    if (!Array.isArray(itens) || itens.length === 0) {
      throw new Error('O carrinho está vazio.');
    }

    const mensagemCodificada = encodeURIComponent(gerarMensagemPedido(itens, observacoes));
    return `https://wa.me/${numeroLimpo}?text=${mensagemCodificada}`;
  }

  const api = { formatarLinhaItem, gerarMensagemPedido, gerarLinkWhatsApp };

  if (ambienteNode) {
    module.exports = api;
  } else {
    raiz.Loja = raiz.Loja || {};
    raiz.Loja.whatsapp = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
