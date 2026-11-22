const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { lerDadosIniciais, textoSql, gerarSql } = require('../ferramentas/gerar-sql-catalogo.js');

test('escapa aspas e barras para o SQL', () => {
  assert.equal(textoSql("Saia D'água"), "'Saia D''água'");
  assert.equal(textoSql('C:\\pasta'), "'C:\\\\pasta'");
});

test('gera a carga com todos os produtos, contatos e o valor mínimo atuais', () => {
  const dadosIniciais = lerDadosIniciais(path.join(__dirname, '..', 'js', 'dados', 'dados-iniciais.js'));
  const sql = gerarSql(dadosIniciais);
  for (const produto of dadosIniciais.produtos) {
    assert.ok(sql.includes(`'${produto.id}'`), `falta o produto ${produto.id}`);
  }
  assert.ok(sql.includes("('contato-principal', 'Atendimento', '5521979396729', 1, 0)"));
  assert.ok(sql.includes(`('valorMinimo', '${dadosIniciais.configuracao.valorMinimo}')`));
});
