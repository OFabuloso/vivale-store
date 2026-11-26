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
  const usuario = await api.entrar('dono', 'senha-secreta');
  await api.salvarProduto({ nome: 'Vestido' });

  assert.deepEqual(usuario, { usuario: 'dono' });
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
