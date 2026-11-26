const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  LARGURA_COMPROVANTE,
  paraTextoDaImpressora,
  quebrarTexto,
  alinharNasPontas,
  formatarDataDoBanco,
  montarLinhasDoComprovante,
  montarTextoDaPrevia,
  gerarComandosEscPos,
  montarLinkDeImpressaoRawBT,
} = require('../js/logica/comprovante.js');

const vendaNoBalcao = {
  id: 44,
  origem: 'balcao',
  situacao: 'vendido',
  formaPagamento: 'dinheiro',
  total: 392.7,
  observacoes: 'Cliente da loja',
  atendente: null,
  finalizadoPor: 'Ana Souza',
  criadoEm: '2026-11-26 08:41:00',
  finalizadoEm: '2026-11-26 08:41:05',
  itens: [
    { idProduto: 'prd-1', nome: 'Conjunto Saia Ruffled com Fenda Drapeada e Top Frente Única', tamanho: 'M', cor: 'Azul Bebê', quantidade: 2, preco: 130.9 },
    { idProduto: 'prd-2', nome: 'Corset', tamanho: 'U', cor: 'Preto', quantidade: 1, preco: 130.9 },
  ],
};

test('tira acentos e símbolos que a impressora não conhece', () => {
  assert.equal(paraTextoDaImpressora('Não é Única · nº 3'), 'Nao e Unica ? no 3');
  assert.equal(paraTextoDaImpressora('R$ 130,90'), 'R$ 130,90');
});

test('quebra o nome longo sem cortar palavras e com recuo nas continuações', () => {
  const linhas = quebrarTexto('2x Conjunto Saia Ruffled com Fenda Drapeada e Top Frente Única', 32, '   ');
  assert.deepEqual(linhas, ['2x Conjunto Saia Ruffled com', '   Fenda Drapeada e Top Frente', '   Unica']);
  assert.ok(quebrarTexto('X'.repeat(40), 32).every((linha) => linha.length <= 32), 'palavra enorme é cortada no limite');
});

test('alinha nas pontas e formata a data do banco', () => {
  assert.equal(alinharNasPontas('TOTAL', 'R$ 392,70'), `TOTAL${' '.repeat(18)}R$ 392,70`);
  assert.equal(alinharNasPontas('TOTAL', 'R$ 392,70').length, 32);
  assert.equal(formatarDataDoBanco('2026-11-26 08:41:05'), '26/11/2026 08:41');
});

test('o comprovante cabe em 32 colunas e traz número, itens, total, pagamento e aviso fiscal', () => {
  const linhas = montarLinhasDoComprovante(vendaNoBalcao);
  const texto = linhas.map((linha) => linha.texto).join('\n');
  assert.ok(linhas.every((linha) => linha.texto.length <= (linha.grande ? LARGURA_COMPROVANTE / 2 : LARGURA_COMPROVANTE)), texto);
  assert.ok(linhas.every((linha) => /^[\x20-\x7e]*$/.test(linha.texto)), 'só caracteres simples');
  assert.match(texto, /^Pedido no 44 +26\/11\/2026 08:41$/m);
  assert.match(texto, /^Origem: Balcao$/m);
  assert.match(texto, /^Vendedor: Ana Souza$/m);
  assert.match(texto, /^ {3}M \/ Azul Bebe +R\$ 261,80$/m);
  assert.match(texto, /^ {3}Unico \/ Preto +R\$ 130,90$/m);
  assert.match(texto, /^Pecas: 3$/m);
  assert.match(texto, /^TOTAL +R\$ 392,70$/m);
  assert.match(texto, /^Pagamento: Dinheiro$/m);
  assert.match(texto, /^Obs\.: Cliente da loja$/m);
  assert.match(texto, /Nao e documento fiscal/);
  assert.equal(linhas.find((linha) => linha.texto.startsWith('TOTAL')).negrito, true);
});

test('pedido do site mostra o atendente na origem', () => {
  const texto = montarLinhasDoComprovante({ ...vendaNoBalcao, origem: 'site', atendente: 'Atendimento' }).map((linha) => linha.texto).join('\n');
  assert.match(texto, /^Origem: Site \(Atendimento\)$/m);
});

test('comandos ESC/POS: reinicia, centraliza o título em dobro, termina avançando e cortando', () => {
  const bytes = gerarComandosEscPos([{ texto: 'VIVALE', centralizada: true, negrito: true, grande: true }, { texto: 'Linha' }]);
  assert.deepEqual([...bytes.slice(0, 11)], [0x1b, 0x40, 0x1b, 0x61, 1, 0x1b, 0x45, 1, 0x1d, 0x21, 0x11]);
  assert.equal(String.fromCharCode(...bytes.slice(11, 17)), 'VIVALE');
  assert.deepEqual([...bytes.slice(-7)], [0x1b, 0x64, 4, 0x1d, 0x56, 0x42, 0]);
});

test('o link do RawBT leva os comandos em base64 sem codificação de URL', () => {
  const link = montarLinkDeImpressaoRawBT(vendaNoBalcao);
  assert.match(link, /^intent:base64,[A-Za-z0-9+/=]+#Intent;scheme=rawbt;package=ru\.a402d\.rawbtprinter;end;$/);
  const bytes = Buffer.from(link.slice('intent:base64,'.length, link.indexOf('#')), 'base64');
  assert.ok(bytes.toString('latin1').includes('TOTAL'));
});

test('a prévia na tela centraliza as mesmas linhas que a impressora centraliza', () => {
  const previa = montarTextoDaPrevia([{ texto: 'VIVALE STORE', centralizada: true }, { texto: 'Pedido no 44' }]);
  assert.equal(previa, `${' '.repeat(10)}VIVALE STORE\nPedido no 44`);
});
