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

test('bloqueia as peças internas do backend e os arquivos de desenvolvimento', () => {
  assert.match(conteudoHtaccess, /RewriteRule \^api\/\(nucleo\|sql\)\(\/\|\$\) - \[F,L\]/);
  assert.match(conteudoHtaccess, /tests-api/);
  assert.match(conteudoHtaccess, /docker\)/);
  assert.match(conteudoHtaccess, /docker-compose\\\.yml/);
});

test('a API do painel e o login também pedem a senha do servidor', () => {
  for (const arquivo of ['api/admin/.htaccess', 'api/.htaccess']) {
    const conteudo = fs.readFileSync(path.join(__dirname, '..', arquivo), 'utf8');
    assert.match(conteudo, /AuthType Basic/, arquivo);
    assert.match(conteudo, /Require valid-user/, arquivo);
    assert.ok(!conteudo.includes('public_html/.htpasswd'), arquivo);
  }
});

test('JS e CSS são conferidos a cada visita, qualquer que seja o tipo informado', () => {
  const blocoJsCss = conteudoHtaccess.match(/<FilesMatch "\\\.\(js\|css\)\$">([\s\S]*?)<\/FilesMatch>/);
  assert.ok(blocoJsCss, 'falta o bloco <FilesMatch> de JS e CSS');
  assert.match(blocoJsCss[1], /Cache-Control "no-cache"/);
});

test('as páginas pedem os scripts e o CSS com versão, para escapar de caches antigos', () => {
  for (const pagina of ['index.html', 'contato.html', 'admin.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', pagina), 'utf8');
    const enderecosLocais = [...html.matchAll(/(?:src|href)="((?:js|css)\/[^"]+)"/g)].map((resultado) => resultado[1]);
    assert.ok(enderecosLocais.length > 0, pagina);
    for (const endereco of enderecosLocais) assert.match(endereco, /\?v=\d+$/, `${pagina}: ${endereco}`);
  }
});
