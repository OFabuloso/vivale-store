const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const conteudoHtaccess = fs.readFileSync(path.join(__dirname, '..', '.htaccess'), 'utf8');

/** Devolve o trecho de um bloco <Files "nome"> ... </Files>, ou null se não existir. */
function extrairBlocoArquivo(nomeArquivo) {
  const padraoBloco = new RegExp(`<Files "${nomeArquivo.replace('.', '\\.')}">([\\s\\S]*?)</Files>`);
  const resultado = conteudoHtaccess.match(padraoBloco);
  return resultado ? resultado[1] : null;
}

test('o painel admin exige usuário e senha do servidor', () => {
  const blocoAdmin = extrairBlocoArquivo('admin.html');
  assert.ok(blocoAdmin, 'falta o bloco <Files "admin.html"> no .htaccess');
  assert.match(blocoAdmin, /AuthType Basic/);
  assert.match(blocoAdmin, /Require valid-user/);
});

test('o arquivo de senhas fica fora da public_html', () => {
  const blocoAdmin = extrairBlocoArquivo('admin.html');
  const caminhoSenhas = blocoAdmin.match(/AuthUserFile\s+(\S+)/)[1];
  assert.ok(path.isAbsolute(caminhoSenhas), 'o AuthUserFile precisa de caminho absoluto');
  assert.ok(!caminhoSenhas.includes('public_html'), 'o .htpasswd não pode ficar na pasta pública');
});

test('as páginas da loja continuam abertas às clientes', () => {
  assert.equal(extrairBlocoArquivo('index.html'), null);
  assert.equal(extrairBlocoArquivo('contato.html'), null);
  assert.equal((conteudoHtaccess.match(/Require valid-user/g) || []).length, 1);
});
