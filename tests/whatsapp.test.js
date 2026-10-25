const { test } = require('node:test');
const assert = require('node:assert/strict');

const { gerarMensagemPedido, gerarLinkWhatsApp } = require('../js/logica/whatsapp.js');

// Mesmo pedido do modelo combinado com a loja
const itensDoExemplo = [
  { chave: 'a', idProduto: 'prd-001', nome: 'Vestido Midi Linho', preco: 65, tamanho: 'M', cor: 'Verde Militar', quantidade: 2 },
  { chave: 'b', idProduto: 'prd-002', nome: 'Conjunto Alfaiataria', preco: 110, tamanho: 'G', cor: 'Off White', quantidade: 1 },
  { chave: 'c', idProduto: 'prd-003', nome: 'Blusa Tricot Modal', preco: 45, tamanho: 'P', cor: 'Rosa Bebê', quantidade: 3 },
];

const mensagemEsperada = [
  'Olá, equipe Vivale Store.',
  'Gostaria de finalizar o pedido no atacado que montei no site.',
  '',
  'Itens do pedido:',
  '- _Vestido Midi Linho_ | Tamanho M | Cor Verde Militar | *2 unidades* x *R$ 65,00*',
  '- _Conjunto Alfaiataria_ | Tamanho G | Cor Off White | *1 unidade* x *R$ 110,00*',
  '- _Blusa Tricot Modal_ | Tamanho P | Cor Rosa Bebê | *3 unidades* x *R$ 45,00*',
  '',
  'Resumo:',
  '- Total de peças: *6 peças*',
  '- Valor total: *R$ 375,00*',
  '',
  'Por favor, confirme a disponibilidade do pedido e informe as condições de pagamento e o prazo de entrega.',
].join('\n');

test('gera a mensagem exatamente no modelo combinado', () => {
  assert.equal(gerarMensagemPedido(itensDoExemplo), mensagemEsperada);
});

test('usa o singular quando há apenas uma peça', () => {
  const mensagem = gerarMensagemPedido([{ ...itensDoExemplo[1] }]);
  assert.match(mensagem, /\*1 unidade\*/);
  assert.match(mensagem, /Total de peças: \*1 peça\*$/m);
});

test('formata milhares e centavos no padrão brasileiro', () => {
  const mensagem = gerarMensagemPedido([{ ...itensDoExemplo[0], preco: 79.9, quantidade: 20 }]);
  assert.match(mensagem, /\*20 unidades\* x \*R\$ 79,90\*/);
  assert.match(mensagem, /Valor total: \*R\$ 1\.598,00\*/);
});

test('inclui as observações antes do encerramento quando preenchidas', () => {
  const mensagem = gerarMensagemPedido(itensDoExemplo, '  Pagamento via Pix\nEntregar na Rua A, 10  ');
  const blocoEsperado = [
    '- Valor total: *R$ 375,00*',
    '',
    'Observações:',
    'Pagamento via Pix\nEntregar na Rua A, 10',
    '',
    'Por favor, confirme',
  ].join('\n');
  assert.ok(mensagem.includes(blocoEsperado));
});

test('omite o bloco de observações quando vazio ou só com espaços', () => {
  assert.equal(gerarMensagemPedido(itensDoExemplo, '   '), mensagemEsperada);
  assert.doesNotMatch(gerarMensagemPedido(itensDoExemplo), /Observações/);
});

test('envia as observações no link do WhatsApp', () => {
  const link = gerarLinkWhatsApp('(11) 99999-8888', itensDoExemplo, 'Pagamento via Pix');
  const textoEnviado = new URLSearchParams(link.split('?')[1]).get('text');
  assert.match(textoEnviado, /Observações:\nPagamento via Pix/);
});

test('não contém emojis', () => {
  assert.doesNotMatch(gerarMensagemPedido(itensDoExemplo), /\p{Extended_Pictographic}/u);
});

test('gera o link wa.me com o número e a mensagem codificada', () => {
  const link = gerarLinkWhatsApp('(11) 99999-8888', itensDoExemplo);
  const [endereco, parametros] = link.split('?');

  assert.equal(endereco, 'https://wa.me/5511999998888');
  assert.equal(new URLSearchParams(parametros).get('text'), mensagemEsperada);
  assert.ok(!link.includes(' '), 'o link não pode conter espaços sem codificação');
});

test('mantém o número que já vem com código do país', () => {
  const link = gerarLinkWhatsApp('+55 21 98888-7777', itensDoExemplo);
  assert.ok(link.startsWith('https://wa.me/5521988887777?text='));
});

test('recusa número inválido ou carrinho vazio', () => {
  assert.throws(() => gerarLinkWhatsApp('1234', itensDoExemplo), /WhatsApp/);
  assert.throws(() => gerarLinkWhatsApp('11999998888', []), /vazio/);
});
