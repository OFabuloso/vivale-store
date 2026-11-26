const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const conteudoHtaccess = fs.readFileSync(path.join(__dirname, '..', '.htaccess'), 'utf8');

const ARQUIVOS_HTACCESS = ['.htaccess', 'api/.htaccess', 'api/admin/.htaccess'];

test('nenhuma página pede a senha do servidor: o acesso ao painel é pelo login do painel', () => {
  for (const arquivo of ARQUIVOS_HTACCESS) {
    const conteudo = fs.readFileSync(path.join(__dirname, '..', arquivo), 'utf8');
    const linhasComRegras = conteudo.split('\n').filter((linha) => linha.trim() && !linha.trim().startsWith('#'));
    assert.ok(!linhasComRegras.some((linha) => /AuthType|Require valid-user|AuthUserFile/.test(linha)), arquivo);
  }
});

test('bloqueia as peças internas do backend e os arquivos de desenvolvimento', () => {
  assert.match(conteudoHtaccess, /RewriteRule \^api\/\(nucleo\|sql\)\(\/\|\$\) - \[F,L\]/);
  assert.match(conteudoHtaccess, /tests-api/);
  assert.match(conteudoHtaccess, /docker\)/);
  assert.match(conteudoHtaccess, /docker-compose\\\.yml/);
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
