const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Simula o fetch do navegador para conferir o que o api.js envia e como trata as respostas
const requisicoesFeitas = [];
let proximasRespostas = [];
globalThis.fetch = async (caminho, opcoes) => {
  requisicoesFeitas.push({ caminho, ...opcoes });
  const { status = 200, dados = {} } = proximasRespostas.shift() || {};
  return { ok: status >= 200 && status < 300, status, json: async () => dados };
};

const api = require('../js/logica/api.js');

beforeEach(() => {
  requisicoesFeitas.length = 0;
  proximasRespostas = [];
});

test('busca o catálogo público sem cabeçalho CSRF', async () => {
  proximasRespostas = [{ dados: { produtos: [], configuracao: {} } }];
  await api.buscarCatalogoPublico();
  assert.equal(requisicoesFeitas[0].caminho, 'api/catalogo.php');
  assert.equal(requisicoesFeitas[0].method, 'GET');
  assert.equal(requisicoesFeitas[0].headers['X-CSRF-Token'], undefined);
});

test('pega o token CSRF da sessão antes do login e o envia nas alterações', async () => {
  proximasRespostas = [
    { dados: { usuario: null, tokenCsrf: 'token-da-sessao' } },
    { dados: { usuario: { usuario: 'dono' }, tokenCsrf: 'token-novo' } },
    { dados: { produto: { id: 'prd-1' } } },
  ];
  const resultado = await api.entrar('dono', 'senha-secreta');
  await api.salvarProduto({ nome: 'Vestido' });

  assert.deepEqual(resultado, { usuario: { usuario: 'dono' }, precisaCodigo: false });
  assert.equal(requisicoesFeitas[1].headers['X-CSRF-Token'], 'token-da-sessao');
  assert.deepEqual(JSON.parse(requisicoesFeitas[1].body), { usuario: 'dono', senha: 'senha-secreta' });
  // Depois do login o servidor troca o token; as próximas alterações usam o novo
  assert.equal(requisicoesFeitas[2].headers['X-CSRF-Token'], 'token-novo');
  assert.equal(requisicoesFeitas[2].credentials, 'same-origin');
});

test('transforma a resposta de erro em ErroDaApi com a mensagem do servidor', async () => {
  proximasRespostas = [{ status: 401, dados: { erro: 'Faça login para continuar.' } }];
  await assert.rejects(api.carregarPainel(), (erro) => {
    assert.ok(erro instanceof api.ErroDaApi);
    assert.equal(erro.codigoHttp, 401);
    assert.equal(erro.message, 'Faça login para continuar.');
    return true;
  });
});

test('sem conexão, avisa em português', async () => {
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };
  try {
    await assert.rejects(api.buscarCatalogoPublico(), /Sem conexão com o servidor/);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test('codifica o id ao excluir um produto', async () => {
  await api.excluirProduto('prd 1&x');
  assert.equal(requisicoesFeitas[0].caminho, 'api/admin/produtos.php?id=prd%201%26x');
  assert.equal(requisicoesFeitas[0].method, 'DELETE');
});

test('sincroniza o catálogo do servidor quando ele traz produtos', async () => {
  const catalogosAplicados = [];
  globalThis.Loja = { armazenamento: { aplicarCatalogoDoServidor: (catalogo) => catalogosAplicados.push(catalogo) } };
  try {
    proximasRespostas = [{ dados: { produtos: [{ id: 'prd-1' }], configuracao: {} } }];
    assert.equal(await api.sincronizarCatalogo(), true);
    assert.equal(catalogosAplicados.length, 1);
  } finally {
    delete globalThis.Loja;
  }
});

test('catálogo vazio do servidor não apaga o catálogo guardado', async () => {
  const catalogosAplicados = [];
  globalThis.Loja = { armazenamento: { aplicarCatalogoDoServidor: (catalogo) => catalogosAplicados.push(catalogo) } };
  const avisoOriginal = console.warn;
  console.warn = () => {};
  try {
    proximasRespostas = [{ dados: { produtos: [], configuracao: { contatosWhatsApp: [] } } }];
    assert.equal(await api.sincronizarCatalogo(), false);
    assert.equal(catalogosAplicados.length, 0);
  } finally {
    console.warn = avisoOriginal;
    delete globalThis.Loja;
  }
});

test('baixa o backup como arquivo, com o nome sugerido pelo servidor', async () => {
  const fetchOriginal = globalThis.fetch;
  const arquivoZip = new Blob(['PK'], { type: 'application/zip' });
  globalThis.fetch = async (caminho, opcoes) => {
    requisicoesFeitas.push({ caminho, ...opcoes });
    return {
      ok: true,
      status: 200,
      headers: { get: (nome) => (nome === 'Content-Disposition' ? 'attachment; filename="vivale-backup-2026-11-26-030000.zip"' : null) },
      blob: async () => arquivoZip,
    };
  };
  try {
    const resultado = await api.baixarBackup();
    assert.equal(requisicoesFeitas[0].caminho, 'api/admin/backup.php');
    assert.equal(resultado.arquivo, arquivoZip);
    assert.equal(resultado.nomeArquivo, 'vivale-backup-2026-11-26-030000.zip');
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test('erro ao baixar o backup traz a mensagem do servidor', async () => {
  proximasRespostas = [{ status: 403, dados: { erro: 'Só o dono da loja pode fazer isso.' } }];
  await assert.rejects(api.baixarBackup(), /Só o dono da loja/);
});

test('login com 2FA: a primeira etapa pede o código e a segunda envia só o código', async () => {
  proximasRespostas = [
    { dados: { usuario: null, precisaCodigo: true, tokenCsrf: 'token-1' } },
    { dados: { usuario: { usuario: 'dono' }, precisaCodigo: false, tokenCsrf: 'token-2' } },
  ];
  const primeiraEtapa = await api.entrar('dono', 'senha-secreta');
  assert.deepEqual(primeiraEtapa, { usuario: null, precisaCodigo: true });

  const usuario = await api.confirmarCodigoDoLogin('123456');
  assert.deepEqual(usuario, { usuario: 'dono' });
  assert.equal(requisicoesFeitas.at(-1).caminho, 'api/sessao.php');
  assert.deepEqual(JSON.parse(requisicoesFeitas.at(-1).body), { codigo: '123456' });
  assert.equal(requisicoesFeitas.at(-1).headers['X-CSRF-Token'], 'token-1');
});

test('as ações do 2FA vão para o endpoint certo com a ação certa', async () => {
  await api.iniciarDoisFatores('minha-senha');
  await api.confirmarDoisFatores('123456');
  await api.desativarDoisFatores('minha-senha', '654321');
  await api.gerarNovosCodigosDeRecuperacao('111222');
  const corpos = requisicoesFeitas.map((requisicao) => JSON.parse(requisicao.body));
  assert.ok(requisicoesFeitas.every((requisicao) => requisicao.caminho === 'api/admin/dois-fatores.php'));
  assert.deepEqual(corpos, [
    { acao: 'iniciar', senha: 'minha-senha' },
    { acao: 'confirmar', codigo: '123456' },
    { acao: 'desativar', senha: 'minha-senha', codigo: '654321' },
    { acao: 'novosCodigos', codigo: '111222' },
  ]);
});

test('registra o pedido do site só com o necessário; se o servidor falhar, devolve null sem travar', async () => {
  proximasRespostas = [{ status: 201, dados: { numero: 42 } }];
  const itens = [{ chave: 'prd-1|M|Azul', idProduto: 'prd-1', nome: 'Vestido', preco: 65, tamanho: 'M', cor: 'Azul', quantidade: 2 }];
  assert.equal(await api.registrarPedidoDoSite(itens, 'obs', 'contato-1'), 42);
  assert.deepEqual(JSON.parse(requisicoesFeitas[0].body), {
    itens: [{ idProduto: 'prd-1', tamanho: 'M', cor: 'Azul', quantidade: 2 }],
    observacoes: 'obs',
    idContato: 'contato-1',
  });

  const avisoOriginal = console.warn;
  console.warn = () => {};
  try {
    proximasRespostas = [{ status: 500, dados: { erro: 'falhou' } }];
    assert.equal(await api.registrarPedidoDoSite(itens, '', 'contato-1'), null);
  } finally {
    console.warn = avisoOriginal;
  }
});
