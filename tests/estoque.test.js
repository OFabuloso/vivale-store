const { test } = require('node:test');
const assert = require('node:assert/strict');

const { variacaoEsgotada, produtoEsgotado, opcaoEsgotada, montarGrade, resumirEstoque, listarAlertas } = require('../js/logica/estoque.js');

const vestido = { id: 'prd-1', nome: 'Vestido', tamanhos: ['P', 'M'], cores: ['Azul', 'Preto'], esgotados: ['M|Azul', 'M|Preto', 'P|Azul'] };

test('reconhece a variação esgotada pela chave tamanho|cor', () => {
  assert.equal(variacaoEsgotada(vestido, 'M', 'Azul'), true);
  assert.equal(variacaoEsgotada(vestido, 'P', 'Preto'), false);
  assert.equal(variacaoEsgotada({ ...vestido, esgotados: undefined }, 'M', 'Azul'), false);
});

test('o produto só fica todo esgotado quando acabou em todas as variações', () => {
  assert.equal(produtoEsgotado(vestido), false);
  assert.equal(produtoEsgotado({ ...vestido, esgotados: [...vestido.esgotados, 'P|Preto'] }), true);
  assert.equal(produtoEsgotado({ ...vestido, esgotados: [] }), false);
});

test('risca a opção conforme a outra escolha: tamanho M acabou em todas as cores, P só no Azul', () => {
  assert.equal(opcaoEsgotada(vestido, 'tamanho', 'M', null), true);
  assert.equal(opcaoEsgotada(vestido, 'tamanho', 'P', null), false);
  assert.equal(opcaoEsgotada(vestido, 'tamanho', 'P', 'Azul'), true);
  assert.equal(opcaoEsgotada(vestido, 'cor', 'Preto', 'P'), false);
  assert.equal(opcaoEsgotada(vestido, 'cor', 'Azul', null), true);
});

test('no painel, monta a grade com zero onde não há número e resume o estoque', () => {
  const produto = { tamanhos: ['P', 'M'], cores: ['Azul'], alertaEstoque: 3, estoque: { 'P|Azul': 10, 'M|Azul': 2 } };
  assert.deepEqual(montarGrade({ ...produto, estoque: { 'P|Azul': 4 } }), { 'P|Azul': 4, 'M|Azul': 0 });
  assert.deepEqual(resumirEstoque(produto), { totalPecas: 12, variacoesEsgotadas: 0, variacoesEmAlerta: 1 });
});

test('alerta lista as variações no mínimo ou abaixo, só de produtos ativos com controle, zeradas primeiro', () => {
  const produtos = [
    { id: 'a', nome: 'A', ativo: true, controlaEstoque: true, alertaEstoque: 3, tamanhos: ['P', 'M'], cores: ['Azul'], estoque: { 'P|Azul': 3, 'M|Azul': 0 } },
    { id: 'b', nome: 'B', ativo: false, controlaEstoque: true, alertaEstoque: 3, tamanhos: ['P'], cores: ['Azul'], estoque: {} },
    { id: 'c', nome: 'C', ativo: true, controlaEstoque: false, alertaEstoque: 3, tamanhos: ['P'], cores: ['Azul'], estoque: {} },
  ];
  assert.deepEqual(
    listarAlertas(produtos).map((alerta) => `${alerta.nome} ${alerta.tamanho} ${alerta.quantidade}`),
    ['A M 0', 'A P 3'],
  );
});
