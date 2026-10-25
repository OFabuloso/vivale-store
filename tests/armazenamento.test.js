const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// O módulo foi escrito para o navegador: simula window e localStorage antes de carregá-lo
const conteudoArmazenado = new Map();
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: (chave) => (conteudoArmazenado.has(chave) ? conteudoArmazenado.get(chave) : null),
  setItem: (chave, valor) => conteudoArmazenado.set(chave, String(valor)),
  removeItem: (chave) => conteudoArmazenado.delete(chave),
};
require('../js/logica/armazenamento.js');
const { armazenamento } = globalThis.Loja;

beforeEach(() => conteudoArmazenado.clear());

test('observações começam vazias', () => {
  assert.equal(armazenamento.obterObservacoes(), '');
});

test('salva e recupera as observações do pedido', () => {
  armazenamento.salvarObservacoes('Pagamento via Pix\nEntregar à tarde');
  assert.equal(armazenamento.obterObservacoes(), 'Pagamento via Pix\nEntregar à tarde');
});

test('limpa as observações ao salvar texto vazio', () => {
  armazenamento.salvarObservacoes('Pagamento via Pix');
  armazenamento.salvarObservacoes('');
  assert.equal(armazenamento.obterObservacoes(), '');
});

test('ignora valor corrompido ou de tipo inesperado', () => {
  conteudoArmazenado.set(armazenamento.CHAVES.observacoes, '{quebrado');
  assert.equal(armazenamento.obterObservacoes(), '');
  conteudoArmazenado.set(armazenamento.CHAVES.observacoes, '42');
  assert.equal(armazenamento.obterObservacoes(), '');
});
