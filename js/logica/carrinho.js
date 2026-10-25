/**
 * Regras do carrinho em funções puras: recebem a lista de itens e devolvem uma NOVA lista.
 * Não acessam o LocalStorage nem o DOM, por isso são fáceis de testar.
 *
 * Estrutura de um item do carrinho:
 * {
 *   chave: "prd-001|M|Verde Militar",  // identifica a combinação produto + tamanho + cor
 *   idProduto: "prd-001",
 *   nome: "Vestido Midi Linho",
 *   preco: 65,                          // preço unitário no atacado (em reais)
 *   tamanho: "M",
 *   cor: "Verde Militar",
 *   quantidade: 2
 * }
 */
(function (raiz) {
  'use strict';

  const utilidades =
    typeof module !== 'undefined' && module.exports
      ? require('./utilidades.js')
      : raiz.Loja.utilidades;

  /** Monta a chave única de uma variação de produto no carrinho. */
  function montarChaveItem(idProduto, tamanho, cor) {
    return `${idProduto}|${tamanho}|${cor}`;
  }

  /** Adiciona uma variação ao carrinho; se ela já existir, soma a quantidade. */
  function adicionarItem(itens, produto, tamanho, cor, quantidade) {
    const quantidadeAdicionada = Math.floor(Number(quantidade));
    if (!Number.isFinite(quantidadeAdicionada) || quantidadeAdicionada <= 0) {
      return itens;
    }

    const chave = montarChaveItem(produto.id, tamanho, cor);
    const itemExistente = itens.find((item) => item.chave === chave);

    if (itemExistente) {
      return itens.map((item) =>
        item.chave === chave
          ? { ...item, quantidade: item.quantidade + quantidadeAdicionada }
          : item,
      );
    }

    const novoItem = {
      chave,
      idProduto: produto.id,
      nome: produto.nome,
      preco: Number(produto.preco),
      tamanho,
      cor,
      quantidade: quantidadeAdicionada,
    };
    return [...itens, novoItem];
  }

  /** Altera a quantidade de um item. Quantidade zero ou negativa remove o item. */
  function alterarQuantidade(itens, chave, novaQuantidade) {
    const quantidadeInteira = Math.floor(Number(novaQuantidade));
    if (!Number.isFinite(quantidadeInteira) || quantidadeInteira <= 0) {
      return removerItem(itens, chave);
    }
    return itens.map((item) =>
      item.chave === chave ? { ...item, quantidade: quantidadeInteira } : item,
    );
  }

  /** Remove um item do carrinho pela chave. */
  function removerItem(itens, chave) {
    return itens.filter((item) => item.chave !== chave);
  }

  /** Soma a quantidade total de peças do carrinho. */
  function contarPecas(itens) {
    return itens.reduce((totalPecas, item) => totalPecas + item.quantidade, 0);
  }

  /** Calcula o subtotal de um item (preço unitário x quantidade), em reais. */
  function calcularSubtotal(item) {
    return (utilidades.paraCentavos(item.preco) * item.quantidade) / 100;
  }

  /** Calcula o valor total do carrinho em reais (somando em centavos para evitar erros de arredondamento). */
  function calcularTotal(itens) {
    const totalEmCentavos = itens.reduce(
      (soma, item) => soma + utilidades.paraCentavos(item.preco) * item.quantidade,
      0,
    );
    return totalEmCentavos / 100;
  }

  /** Verifica se o carrinho atingiu o valor mínimo de compra do atacado. */
  function validarPedidoMinimo(itens, valorMinimo) {
    const valorTotal = calcularTotal(itens);
    const valorMinimoEmCentavos = utilidades.paraCentavos(valorMinimo || 0);
    const faltanteEmCentavos = Math.max(
      0,
      valorMinimoEmCentavos - utilidades.paraCentavos(valorTotal),
    );
    return {
      atingido: itens.length > 0 && faltanteEmCentavos === 0,
      valorTotal,
      valorFaltante: faltanteEmCentavos / 100,
      percentualAtingido:
        valorMinimoEmCentavos > 0
          ? Math.min(100, (utilidades.paraCentavos(valorTotal) / valorMinimoEmCentavos) * 100)
          : 100,
    };
  }

  /**
   * Ajusta os itens ao catálogo atual: atualiza preço e nome e remove itens cujo produto
   * foi excluído/inativado ou cujo tamanho/cor deixou de ser oferecido.
   * Devolve { itens, houveMudanca } para a tela poder avisar a cliente.
   */
  function sincronizarComCatalogo(itens, produtosAtivos) {
    const produtosPorId = new Map(produtosAtivos.map((produto) => [produto.id, produto]));
    let houveMudanca = false;
    const itensSincronizados = [];

    itens.forEach((item) => {
      const produto = produtosPorId.get(item.idProduto);
      const variacaoDisponivel =
        produto && produto.tamanhos.includes(item.tamanho) && produto.cores.includes(item.cor);
      if (!variacaoDisponivel) {
        houveMudanca = true;
        return;
      }

      const precoAtual = Number(produto.preco);
      if (item.preco === precoAtual && item.nome === produto.nome) {
        itensSincronizados.push(item);
        return;
      }
      houveMudanca = true;
      itensSincronizados.push({ ...item, preco: precoAtual, nome: produto.nome });
    });

    return { itens: houveMudanca ? itensSincronizados : itens, houveMudanca };
  }

  const api = {
    montarChaveItem,
    adicionarItem,
    alterarQuantidade,
    removerItem,
    contarPecas,
    calcularSubtotal,
    calcularTotal,
    validarPedidoMinimo,
    sincronizarComCatalogo,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    raiz.Loja = raiz.Loja || {};
    raiz.Loja.carrinho = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
