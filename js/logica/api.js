/**
 * Comunicação com o backend (pasta api/ do site, em PHP).
 * A loja busca o catálogo público; o painel usa a sessão de login e o token CSRF.
 * Funciona no navegador (window.Loja.api) e no Node (module.exports) para os testes.
 */
(function (raiz) {
  'use strict';

  const TEMPO_LIMITE_MS = 10000;
  // Na loja, um servidor lento não pode segurar a vitrine: usa o catálogo guardado
  const TEMPO_LIMITE_CATALOGO_MS = 4000;

  /** Erro devolvido pela API, com o código HTTP (401 = precisa de login, 422 = dado inválido...). */
  class ErroDaApi extends Error {
    constructor(mensagem, codigoHttp) {
      super(mensagem);
      this.name = 'ErroDaApi';
      this.codigoHttp = codigoHttp;
    }
  }

  let tokenCsrf = '';

  /** Faz a requisição e devolve o JSON da resposta; lança ErroDaApi com mensagem em português. */
  async function requisitar(caminho, opcoes = {}) {
    const { metodo = 'GET', corpo, tempoLimiteMs = TEMPO_LIMITE_MS, comoArquivo = false } = opcoes;
    const cabecalhos = { Accept: 'application/json' };
    if (metodo !== 'GET') cabecalhos['X-CSRF-Token'] = tokenCsrf;

    let corpoEnviado;
    if (corpo instanceof raiz.FormData) {
      corpoEnviado = corpo; // o navegador monta o multipart sozinho
    } else if (corpo !== undefined) {
      cabecalhos['Content-Type'] = 'application/json';
      corpoEnviado = JSON.stringify(corpo);
    }

    const controle = new AbortController();
    const temporizador = setTimeout(() => controle.abort(), tempoLimiteMs);
    let resposta;
    try {
      resposta = await raiz.fetch(caminho, {
        method: metodo,
        headers: cabecalhos,
        body: corpoEnviado,
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controle.signal,
      });
    } catch (erro) {
      throw new ErroDaApi('Sem conexão com o servidor. Confira a internet e tente de novo.', 0);
    } finally {
      clearTimeout(temporizador);
    }

    if (!resposta.ok) {
      const dadosDoErro = await resposta.json().catch(() => null);
      const mensagem = dadosDoErro && dadosDoErro.erro ? dadosDoErro.erro : 'O servidor não respondeu como esperado.';
      throw new ErroDaApi(mensagem, resposta.status);
    }
    if (comoArquivo) {
      return { arquivo: await resposta.blob(), nomeArquivo: lerNomeDoArquivo(resposta) };
    }
    const dados = await resposta.json().catch(() => null);
    if (dados && dados.tokenCsrf) tokenCsrf = dados.tokenCsrf;
    return dados;
  }

  /** Nome sugerido pelo servidor no cabeçalho Content-Disposition (ou um nome padrão). */
  function lerNomeDoArquivo(resposta) {
    const disposicao = resposta.headers.get('Content-Disposition') || '';
    const resultado = disposicao.match(/filename="([^"]+)"/);
    return resultado ? resultado[1] : 'vivale-backup.zip';
  }

  // ---------- Loja (sem login) ----------

  function buscarCatalogoPublico() {
    return requisitar('api/catalogo.php', { tempoLimiteMs: TEMPO_LIMITE_CATALOGO_MS });
  }

  /**
   * Registra o pedido da cliente antes de abrir o WhatsApp e devolve o número dele.
   * Nunca lança: se o servidor falhar, devolve null e o WhatsApp abre sem número.
   */
  async function registrarPedidoDoSite(itens, observacoes, idContato) {
    try {
      const corpo = {
        itens: itens.map((item) => ({ idProduto: item.idProduto, tamanho: item.tamanho, cor: item.cor, quantidade: item.quantidade })),
        observacoes,
        idContato,
      };
      return (await requisitar('api/pedidos.php', { metodo: 'POST', corpo, tempoLimiteMs: TEMPO_LIMITE_CATALOGO_MS })).numero;
    } catch (erro) {
      console.warn('Não foi possível registrar o pedido no servidor; o WhatsApp abre sem número.', erro);
      return null;
    }
  }

  /**
   * Atualiza o catálogo guardado no navegador com o do servidor.
   * Nunca lança: sem servidor, a loja segue com o que já tinha (ou com os dados iniciais).
   */
  async function sincronizarCatalogo() {
    try {
      const catalogo = await buscarCatalogoPublico();
      // Catálogo sem nenhum produto indica banco vazio ou com problema: a vitrine nunca
      // deve ficar em branco por isso, então mantém o catálogo guardado
      if (!Array.isArray(catalogo.produtos) || catalogo.produtos.length === 0) {
        throw new Error('O servidor respondeu com o catálogo vazio.');
      }
      raiz.Loja.armazenamento.aplicarCatalogoDoServidor(catalogo);
      return true;
    } catch (erro) {
      console.warn('Catálogo do servidor indisponível; usando o catálogo guardado.', erro);
      return false;
    }
  }

  // ---------- Sessão do painel ----------

  /** Quem está logado (ou null). Também busca o token CSRF exigido pelas alterações. */
  async function obterSessao() {
    return (await requisitar('api/sessao.php')).usuario;
  }

  /**
   * Primeira etapa do login. Devolve { usuario, precisaCodigo }: com a verificação em duas etapas
   * ligada, usuario vem null e precisaCodigo true, e o login termina em confirmarCodigoDoLogin().
   */
  async function entrar(usuario, senha) {
    if (!tokenCsrf) await obterSessao();
    const dados = await requisitar('api/sessao.php', { metodo: 'POST', corpo: { usuario, senha } });
    return { usuario: dados.usuario, precisaCodigo: dados.precisaCodigo === true };
  }

  async function confirmarCodigoDoLogin(codigo) {
    return (await requisitar('api/sessao.php', { metodo: 'POST', corpo: { codigo } })).usuario;
  }

  async function sair() {
    await requisitar('api/sessao.php', { metodo: 'DELETE' });
    tokenCsrf = '';
  }

  // ---------- Painel (precisa de login) ----------

  function carregarPainel() {
    return requisitar('api/admin/painel.php');
  }

  async function salvarProduto(produto) {
    return (await requisitar('api/admin/produtos.php', { metodo: 'POST', corpo: produto })).produto;
  }

  function excluirProduto(idProduto) {
    return requisitar(`api/admin/produtos.php?id=${encodeURIComponent(idProduto)}`, { metodo: 'DELETE' });
  }

  async function salvarContatos(listaContatos) {
    const corpo = { contatos: listaContatos };
    return (await requisitar('api/admin/contatos.php', { metodo: 'PUT', corpo })).contatosWhatsApp;
  }

  async function salvarValorMinimo(valorMinimo) {
    const corpo = { valorMinimo };
    return (await requisitar('api/admin/configuracao.php', { metodo: 'PUT', corpo })).valorMinimo;
  }

  /** Envia a foto ao servidor e devolve o endereço dela (ex.: "fotos/<nome>.jpg"). */
  /** Backup completo (banco + fotos) em .zip. Pode demorar se houver muitas fotos. */
  function baixarBackup() {
    return requisitar('api/admin/backup.php', { comoArquivo: true, tempoLimiteMs: 120000 });
  }

  async function enviarFoto(arquivoFoto, nomeArquivo = 'foto.jpg') {
    const formulario = new raiz.FormData();
    formulario.append('foto', arquivoFoto, nomeArquivo);
    const opcoes = { metodo: 'POST', corpo: formulario, tempoLimiteMs: 60000 };
    return (await requisitar('api/admin/fotos.php', opcoes)).foto;
  }

  function trocarSenha(senhaAtual, novaSenha) {
    return requisitar('api/admin/senha.php', { metodo: 'POST', corpo: { senhaAtual, novaSenha } });
  }

  // ---------- Vendas ----------

  /** Pedidos de uma situação (pendente, vendido ou cancelado) e quantos estão pendentes. */
  function listarPedidos(situacao) {
    return requisitar(`api/admin/pedidos.php?situacao=${encodeURIComponent(situacao)}`);
  }

  /** As ações devolvem { pedido, pendentes }, com o pedido completo para imprimir. */
  function venderPedido(id, formaPagamento) {
    return requisitar('api/admin/pedidos.php', { metodo: 'POST', corpo: { acao: 'vender', id, formaPagamento } });
  }

  function cancelarPedido(id) {
    return requisitar('api/admin/pedidos.php', { metodo: 'POST', corpo: { acao: 'cancelar', id } });
  }

  function registrarVendaNoBalcao(itens, formaPagamento, observacoes) {
    return requisitar('api/admin/pedidos.php', { metodo: 'POST', corpo: { acao: 'balcao', itens, formaPagamento, observacoes } });
  }

  // ---------- Verificação em duas etapas (2FA) de quem está logado ----------

  function alterarDoisFatores(corpo) {
    return requisitar('api/admin/dois-fatores.php', { metodo: 'POST', corpo });
  }

  /** Devolve { segredo, enderecoOtpauth } para montar o QR code. */
  function iniciarDoisFatores(senha) {
    return alterarDoisFatores({ acao: 'iniciar', senha });
  }

  /** Liga o 2FA; devolve { ativo, codigosRestantes, codigosRecuperacao }. */
  function confirmarDoisFatores(codigo) {
    return alterarDoisFatores({ acao: 'confirmar', codigo });
  }

  function desativarDoisFatores(senha, codigo) {
    return alterarDoisFatores({ acao: 'desativar', senha, codigo });
  }

  function gerarNovosCodigosDeRecuperacao(codigo) {
    return alterarDoisFatores({ acao: 'novosCodigos', codigo });
  }

  function obterDoisFatores() {
    return requisitar('api/admin/dois-fatores.php');
  }

  // ---------- Equipe (só o dono) ----------

  async function listarEquipe() {
    return (await requisitar('api/admin/usuarios.php')).usuarios;
  }

  async function cadastrarFuncionario(usuario, nome, senha) {
    const corpo = { usuario, nome, senha };
    return (await requisitar('api/admin/usuarios.php', { metodo: 'POST', corpo })).usuarios;
  }

  /** Altera um funcionário: { id, ativo } para ativar/desativar ou { id, novaSenha } para redefinir a senha. */
  async function alterarFuncionario(alteracao) {
    return (await requisitar('api/admin/usuarios.php', { metodo: 'PUT', corpo: alteracao })).usuarios;
  }

  const api = {
    ErroDaApi,
    requisitar,
    buscarCatalogoPublico,
    sincronizarCatalogo,
    registrarPedidoDoSite,
    obterSessao,
    entrar,
    confirmarCodigoDoLogin,
    sair,
    carregarPainel,
    salvarProduto,
    excluirProduto,
    salvarContatos,
    salvarValorMinimo,
    enviarFoto,
    baixarBackup,
    trocarSenha,
    listarEquipe,
    cadastrarFuncionario,
    alterarFuncionario,
    obterDoisFatores,
    listarPedidos,
    venderPedido,
    cancelarPedido,
    registrarVendaNoBalcao,
    iniciarDoisFatores,
    confirmarDoisFatores,
    desativarDoisFatores,
    gerarNovosCodigosDeRecuperacao,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    raiz.Loja = raiz.Loja || {};
    raiz.Loja.api = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
