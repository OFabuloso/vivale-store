const { test } = require('node:test');
const assert = require('node:assert/strict');

const carrinho = require('../js/logica/carrinho.js');
const { lerValorMonetario, normalizarTelefone, escaparHtml } = require('../js/logica/utilidades.js');

const vestido = { id: 'prd-001', nome: 'Vestido Midi Linho', preco: 65 };
const body = { id: 'prd-006', nome: 'Body Canelado', preco: 32.5 };

test('adiciona um item novo ao carrinho', () => {
  const itens = carrinho.adicionarItem([], vestido, 'M', 'Preto', 2);
  assert.equal(itens.length, 1);
  assert.deepEqual(itens[0], {
    chave: 'prd-001|M|Preto',
    idProduto: 'prd-001',
    nome: 'Vestido Midi Linho',
    preco: 65,
    tamanho: 'M',
    cor: 'Preto',
    quantidade: 2,
  });
});

test('soma a quantidade quando a mesma variação é adicionada de novo', () => {
  let itens = carrinho.adicionarItem([], vestido, 'M', 'Preto', 2);
  itens = carrinho.adicionarItem(itens, vestido, 'M', 'Preto', 3);
  assert.equal(itens.length, 1);
  assert.equal(itens[0].quantidade, 5);
});

test('trata tamanhos ou cores diferentes como itens separados', () => {
  let itens = carrinho.adicionarItem([], vestido, 'M', 'Preto', 1);
  itens = carrinho.adicionarItem(itens, vestido, 'G', 'Preto', 1);
  itens = carrinho.adicionarItem(itens, vestido, 'M', 'Off White', 1);
  assert.equal(itens.length, 3);
});

test('ignora quantidades inválidas e não altera a lista original', () => {
  const itensOriginais = carrinho.adicionarItem([], vestido, 'M', 'Preto', 1);
  assert.equal(carrinho.adicionarItem(itensOriginais, vestido, 'M', 'Preto', 0), itensOriginais);
  carrinho.adicionarItem(itensOriginais, vestido, 'M', 'Preto', 4);
  assert.equal(itensOriginais[0].quantidade, 1);
});

test('altera a quantidade e remove quando chega a zero', () => {
  let itens = carrinho.adicionarItem([], vestido, 'M', 'Preto', 2);
  itens = carrinho.alterarQuantidade(itens, 'prd-001|M|Preto', 7);
  assert.equal(itens[0].quantidade, 7);
  itens = carrinho.alterarQuantidade(itens, 'prd-001|M|Preto', 0);
  assert.equal(itens.length, 0);
});

test('remove item pela chave', () => {
  let itens = carrinho.adicionarItem([], vestido, 'M', 'Preto', 1);
  itens = carrinho.adicionarItem(itens, body, 'P', 'Vinho', 1);
  itens = carrinho.removerItem(itens, 'prd-001|M|Preto');
  assert.deepEqual(itens.map((item) => item.idProduto), ['prd-006']);
});

test('conta peças e calcula total sem erro de ponto flutuante', () => {
  let itens = carrinho.adicionarItem([], body, 'P', 'Vinho', 3); // 3 x 32,50
  itens = carrinho.adicionarItem(itens, { id: 'x', nome: 'Top', preco: 0.1 }, 'P', 'Preto', 3); // 3 x 0,10
  assert.equal(carrinho.contarPecas(itens), 6);
  assert.equal(carrinho.calcularTotal(itens), 97.8);
});

test('valida o pedido mínimo e informa quanto falta', () => {
  const abaixo = carrinho.adicionarItem([], vestido, 'M', 'Preto', 4); // R$ 260
  const situacaoAbaixo = carrinho.validarPedidoMinimo(abaixo, 300);
  assert.equal(situacaoAbaixo.atingido, false);
  assert.equal(situacaoAbaixo.valorFaltante, 40);

  const exato = carrinho.adicionarItem([], { ...vestido, preco: 75 }, 'M', 'Preto', 4); // R$ 300
  assert.equal(carrinho.validarPedidoMinimo(exato, 300).atingido, true);
});

test('carrinho vazio nunca atinge o mínimo, mesmo com mínimo zero', () => {
  assert.equal(carrinho.validarPedidoMinimo([], 0).atingido, false);
});

test('utilidades: lê valores digitados em reais', () => {
  assert.equal(lerValorMonetario('65,00'), 65);
  assert.equal(lerValorMonetario('R$ 1.234,56'), 1234.56);
  assert.equal(lerValorMonetario('79.9'), 79.9);
  assert.ok(Number.isNaN(lerValorMonetario('')));
});

test('utilidades: ponto em grupos de 3 dígitos é separador de milhar', () => {
  assert.equal(lerValorMonetario('1.500'), 1500);
  assert.equal(lerValorMonetario('12.345.678'), 12345678);
  assert.equal(lerValorMonetario('79.90'), 79.9);
  assert.equal(lerValorMonetario('1.500,50'), 1500.5);
});

test('utilidades: normaliza telefone e escapa HTML', () => {
  assert.equal(normalizarTelefone('(11) 99999-8888'), '5511999998888');
  assert.equal(normalizarTelefone('(11) 3333-4444'), '551133334444');
  assert.equal(escaparHtml('<b>"Oi"</b>'), '&lt;b&gt;&quot;Oi&quot;&lt;/b&gt;');
});

test('sincroniza: atualiza preço e nome conforme o catálogo atual', () => {
  const itens = carrinho.adicionarItem([], vestido, 'M', 'Preto', 2);
  const catalogo = [{ ...vestido, nome: 'Vestido Midi', preco: 70, tamanhos: ['M'], cores: ['Preto'] }];
  const resultado = carrinho.sincronizarComCatalogo(itens, catalogo);
  assert.equal(resultado.houveMudanca, true);
  assert.equal(resultado.itens[0].preco, 70);
  assert.equal(resultado.itens[0].nome, 'Vestido Midi');
  assert.equal(resultado.itens[0].quantidade, 2);
  assert.equal(itens[0].preco, 65, 'não altera a lista original');
});

test('sincroniza: remove produto inativo/excluído e variação indisponível', () => {
  let itens = carrinho.adicionarItem([], vestido, 'M', 'Preto', 1);
  itens = carrinho.adicionarItem(itens, vestido, 'GG', 'Preto', 1);
  itens = carrinho.adicionarItem(itens, body, 'P', 'Vinho', 1);
  const catalogo = [{ ...vestido, tamanhos: ['M'], cores: ['Preto'] }]; // body saiu, GG saiu
  const resultado = carrinho.sincronizarComCatalogo(itens, catalogo);
  assert.equal(resultado.houveMudanca, true);
  assert.deepEqual(resultado.itens.map((item) => item.chave), ['prd-001|M|Preto']);
});

test('sincroniza: sem mudanças devolve a mesma lista', () => {
  const itens = carrinho.adicionarItem([], vestido, 'M', 'Preto', 1);
  const resultado = carrinho.sincronizarComCatalogo(itens, [{ ...vestido, tamanhos: ['M'], cores: ['Preto'] }]);
  assert.equal(resultado.houveMudanca, false);
  assert.equal(resultado.itens, itens);
});
