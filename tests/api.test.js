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
