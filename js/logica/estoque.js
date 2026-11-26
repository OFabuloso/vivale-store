/**
 * Regras de estoque usadas na loja e no painel.
 * Cada variação é identificada pela chave "TAMANHO|Cor" (ex.: "M|Azul Bebê"), igual ao servidor.
 * Na loja, o produto traz só "esgotados" (lista de chaves); no painel, traz "estoque" ({ chave: quantidade }).
 * Funciona no navegador (window.Loja.estoque) e no Node (module.exports) para os testes.
 */
(function (raiz) {
  'use strict';

  function chaveDaVariacao(tamanho, cor) {
    return `${tamanho}|${cor}`;
  }

  // ---------- Loja ----------

  function variacaoEsgotada(produto, tamanho, cor) {
    return (produto.esgotados || []).includes(chaveDaVariacao(tamanho, cor));
  }

  /** Produto sem nenhuma variação disponível: o cartão ganha o selo "Esgotado". */
  function produtoEsgotado(produto) {
    if (!produto.esgotados || produto.esgotados.length === 0) return false;
    return produto.tamanhos.every((tamanho) => produto.cores.every((cor) => variacaoEsgotada(produto, tamanho, cor)));
  }

  /**
   * Opção de tamanho ou de cor que aparece riscada no detalhe do produto.
   * Com a outra escolha já feita, vale a combinação; sem ela, só risca se acabou em todas.
   */
  function opcaoEsgotada(produto, tipoOpcao, valor, escolhaDoOutroTipo) {
    const outrasOpcoes = escolhaDoOutroTipo ? [escolhaDoOutroTipo] : tipoOpcao === 'tamanho' ? produto.cores : produto.tamanhos;
    return outrasOpcoes.every((outraOpcao) =>
      tipoOpcao === 'tamanho' ? variacaoEsgotada(produto, valor, outraOpcao) : variacaoEsgotada(produto, outraOpcao, valor),
    );
  }

  // ---------- Painel ----------

  /** Grade completa do produto (variação sem número conta como zero). */
  function montarGrade(produto, quantidades = produto.estoque || {}) {
    const grade = {};
    produto.tamanhos.forEach((tamanho) => {
      produto.cores.forEach((cor) => {
        const chave = chaveDaVariacao(tamanho, cor);
        grade[chave] = Number(quantidades[chave]) || 0;
      });
    });
    return grade;
  }

  /** Total de peças e quantas variações estão no mínimo ou zeradas (para as etiquetas da lista). */
  function resumirEstoque(produto) {
    const quantidades = Object.values(montarGrade(produto));
    const alerta = Number(produto.alertaEstoque) || 0;
    return {
      totalPecas: quantidades.reduce((soma, quantidade) => soma + Math.max(0, quantidade), 0),
      variacoesEsgotadas: quantidades.filter((quantidade) => quantidade <= 0).length,
      variacoesEmAlerta: quantidades.filter((quantidade) => quantidade > 0 && quantidade <= alerta).length,
    };
  }

  /** Variações de produtos ativos no mínimo ou abaixo (mesma regra do servidor), esgotadas primeiro. */
  function listarAlertas(produtos) {
    const alertas = [];
    produtos
      .filter((produto) => produto.controlaEstoque && produto.ativo !== false)
      .forEach((produto) => {
        Object.entries(montarGrade(produto)).forEach(([chave, quantidade]) => {
          if (quantidade > (Number(produto.alertaEstoque) || 0)) return;
          const [tamanho, cor] = chave.split('|');
          alertas.push({ idProduto: produto.id, nome: produto.nome, tamanho, cor, quantidade });
        });
      });
    return alertas.sort((primeiro, segundo) => primeiro.quantidade - segundo.quantidade);
  }

  const api = {
    chaveDaVariacao,
    variacaoEsgotada,
    produtoEsgotado,
    opcaoEsgotada,
    montarGrade,
    resumirEstoque,
    listarAlertas,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    raiz.Loja = raiz.Loja || {};
    raiz.Loja.estoque = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
