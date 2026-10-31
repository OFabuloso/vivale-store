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
globalThis.Loja.contatos = require('../js/logica/contatos.js');
globalThis.Loja.dadosIniciais = {
  versao: 1,
  configuracao: {
    contatosWhatsApp: [{ id: 'contato-padrao', nome: 'Atendimento', numero: '5521979396729' }],
    valorMinimo: 500,
  },
  produtos: [],
};

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

test('configuração sem nada salvo usa os contatos dos dados iniciais', () => {
  const configuracao = armazenamento.obterConfiguracao();
  assert.deepEqual(configuracao.contatosWhatsApp, [
    { id: 'contato-padrao', nome: 'Atendimento', numero: '5521979396729' },
  ]);
  assert.equal(configuracao.valorMinimo, 500);
});

test('migra o número único salvo por versões antigas e deixa de expô-lo', () => {
  conteudoArmazenado.set(
    armazenamento.CHAVES.configuracao,
    JSON.stringify({ numeroWhatsApp: '5511999998888', valorMinimo: 300 }),
  );
  const configuracao = armazenamento.obterConfiguracao();
  assert.equal(configuracao.contatosWhatsApp.length, 1);
  assert.equal(configuracao.contatosWhatsApp[0].numero, '5511999998888');
  assert.equal(configuracao.numeroWhatsApp, undefined);
  assert.equal(configuracao.valorMinimo, 300);
});

test('salva e recupera a lista de contatos editada', () => {
  const novosContatos = [
    { id: 'contato-a', nome: 'Vendas', numero: '5521911112222' },
    { id: 'contato-b', nome: 'Gerência', numero: '5521933334444' },
  ];
  armazenamento.salvarConfiguracao({ contatosWhatsApp: novosContatos });
  assert.deepEqual(armazenamento.obterConfiguracao().contatosWhatsApp, novosContatos);
});
