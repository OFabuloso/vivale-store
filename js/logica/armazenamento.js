/**
 * Camada de persistência no LocalStorage do navegador.
 * Toda leitura/escrita de produtos, carrinho e configurações passa por aqui.
 */
(function (raiz) {
  'use strict';

  const CHAVES = {
    produtos: 'loja_atacado_produtos',
    carrinho: 'loja_atacado_carrinho',
    observacoes: 'loja_atacado_observacoes',
    configuracao: 'loja_atacado_configuracao',
    versaoDados: 'loja_atacado_versao_dados',
    senhaAdmin: 'loja_atacado_senha_admin',
  };

  /** Lê e converte um JSON do LocalStorage; devolve o valor padrão se não existir ou estiver corrompido. */
  function lerJson(chave, valorPadrao) {
    try {
      const conteudo = localStorage.getItem(chave);
      return conteudo === null ? valorPadrao : JSON.parse(conteudo);
    } catch (erro) {
      console.warn(`Não foi possível ler "${chave}" do LocalStorage.`, erro);
      return valorPadrao;
    }
  }

  /** Salva um valor como JSON. Lança um erro amigável se o espaço do navegador acabar. */
  function salvarJson(chave, valor) {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
    } catch (erro) {
      if (erro && erro.name === 'QuotaExceededError') {
        throw new Error(
          'Espaço do navegador esgotado. Use fotos menores ou links (URL) em vez de upload.',
        );
      }
      throw erro;
    }
  }

  /** Copia profunda simples (os dados são JSON puros). */
  function clonar(valor) {
    return JSON.parse(JSON.stringify(valor));
  }

  /**
   * Popula o LocalStorage com os dados iniciais quando ele está vazio
   * ou quando o arquivo de dados iniciais é MAIS NOVO que o já salvo.
   * (Comparar "maior que" evita que o Admin perca edições feitas após exportar.)
   */
  function inicializar() {
    migrarSenhaAntiga();
    const dadosIniciais = raiz.Loja.dadosIniciais;
    const versaoSalva = lerJson(CHAVES.versaoDados, null);
    const produtosSalvos = lerJson(CHAVES.produtos, null);
    const arquivoMaisNovo =
      typeof versaoSalva !== 'number' || dadosIniciais.versao > versaoSalva;

    if (produtosSalvos === null || arquivoMaisNovo) {
      restaurarDadosIniciais();
    }
  }

  /** Sobrescreve produtos e configurações com o conteúdo do arquivo de dados iniciais. */
  function restaurarDadosIniciais() {
    const dadosIniciais = raiz.Loja.dadosIniciais;
    salvarJson(CHAVES.produtos, clonar(dadosIniciais.produtos));
    salvarJson(CHAVES.configuracao, clonar(dadosIniciais.configuracao));
    salvarJson(CHAVES.versaoDados, dadosIniciais.versao);
  }

  // ---------- Produtos ----------

  function obterProdutos() {
    return lerJson(CHAVES.produtos, []);
  }

  function obterProdutosAtivos() {
    return obterProdutos().filter((produto) => produto.ativo !== false);
  }

  function obterProdutoPorId(idProduto) {
    return obterProdutos().find((produto) => produto.id === idProduto) || null;
  }

  function salvarProdutos(listaProdutos) {
    salvarJson(CHAVES.produtos, listaProdutos);
  }

  /** Cria o produto se o id não existir, ou atualiza o existente. */
  function salvarProduto(produto) {
    const listaProdutos = obterProdutos();
    const posicao = listaProdutos.findIndex((item) => item.id === produto.id);
    if (posicao >= 0) {
      listaProdutos[posicao] = produto;
    } else {
      listaProdutos.unshift(produto);
    }
    salvarProdutos(listaProdutos);
  }

  function removerProduto(idProduto) {
    salvarProdutos(obterProdutos().filter((produto) => produto.id !== idProduto));
  }

  // ---------- Carrinho ----------

  function obterCarrinho() {
    return lerJson(CHAVES.carrinho, []);
  }

  function salvarCarrinho(itensCarrinho) {
    salvarJson(CHAVES.carrinho, itensCarrinho);
  }

  // ---------- Observações do pedido ----------

  /** Texto livre que a cliente escreve no carrinho (pagamento, entrega...). */
  function obterObservacoes() {
    const observacoesSalvas = lerJson(CHAVES.observacoes, '');
    return typeof observacoesSalvas === 'string' ? observacoesSalvas : '';
  }

  function salvarObservacoes(textoObservacoes) {
    salvarJson(CHAVES.observacoes, String(textoObservacoes || ''));
  }

  // ---------- Configurações ----------

  /** Configurações públicas da loja (nunca inclui a senha do painel). */
  function obterConfiguracao() {
    const configuracaoCompleta = {
      ...raiz.Loja.dadosIniciais.configuracao,
      ...lerJson(CHAVES.configuracao, {}),
    };
    // Um dados-iniciais.js antigo ainda pode trazer a senha; ela não pode vazar para a exportação
    delete configuracaoCompleta.senhaAdmin;
    return configuracaoCompleta;
  }

  function salvarConfiguracao(novaConfiguracao) {
    salvarJson(CHAVES.configuracao, { ...obterConfiguracao(), ...novaConfiguracao });
  }

  // ---------- Senha do painel ----------

  /**
   * A senha fica numa chave separada, só neste navegador: não é exportada
   * nem apagada ao restaurar os dados de exemplo. Retorna null se ainda não foi criada.
   */
  function obterSenhaAdmin() {
    return lerJson(CHAVES.senhaAdmin, null) || null;
  }

  function salvarSenhaAdmin(novaSenha) {
    salvarJson(CHAVES.senhaAdmin, novaSenha);
  }

  /** Versões antigas guardavam a senha junto das configurações; move para a chave própria. */
  function migrarSenhaAntiga() {
    const configuracaoAntiga = lerJson(CHAVES.configuracao, {});
    if (!configuracaoAntiga || !configuracaoAntiga.senhaAdmin) return;
    if (!obterSenhaAdmin()) salvarSenhaAdmin(configuracaoAntiga.senhaAdmin);
    delete configuracaoAntiga.senhaAdmin;
    salvarJson(CHAVES.configuracao, configuracaoAntiga);
  }

  // ---------- Exportação ----------

  /**
   * Gera o conteúdo de um novo "js/dados/dados-iniciais.js" com o catálogo e as configurações atuais.
   * A versão recebe um carimbo de tempo para que os navegadores das clientes recarreguem o catálogo.
   */
  function gerarArquivoDadosIniciais() {
    const novaVersao = Date.now();
    const dadosExportados = {
      versao: novaVersao,
      configuracao: obterConfiguracao(),
      produtos: obterProdutos(),
    };
    // O próprio navegador do Admin passa a considerar esta versão como a atual
    salvarJson(CHAVES.versaoDados, novaVersao);

    return (
      '/** Arquivo gerado pelo painel Admin. Substitua js/dados/dados-iniciais.js por este arquivo. */\n' +
      'window.Loja = window.Loja || {};\n' +
      `window.Loja.dadosIniciais = ${JSON.stringify(dadosExportados, null, 2)};\n`
    );
  }

  raiz.Loja = raiz.Loja || {};
  raiz.Loja.armazenamento = {
    CHAVES,
    inicializar,
    restaurarDadosIniciais,
    obterProdutos,
    obterProdutosAtivos,
    obterProdutoPorId,
    salvarProdutos,
    salvarProduto,
    removerProduto,
    obterCarrinho,
    salvarCarrinho,
    obterObservacoes,
    salvarObservacoes,
    obterConfiguracao,
    salvarConfiguracao,
    obterSenhaAdmin,
    salvarSenhaAdmin,
    gerarArquivoDadosIniciais,
  };
})(window);
