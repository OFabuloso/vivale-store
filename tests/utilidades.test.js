const { test } = require('node:test');
const assert = require('node:assert/strict');

const { obterHexDaCor, obterFundoDaCor } = require('../js/logica/utilidades.js');

const COR_NEUTRA = '#cbbfb4';

test('reconhece cores simples ignorando acentos e maiúsculas', () => {
  assert.equal(obterHexDaCor('Azul Bebê'), '#bcd8f0');
  assert.equal(obterHexDaCor('VERDE LIMA'), '#b5d334');
  assert.equal(obterFundoDaCor('Preto'), '#1f1f1f');
});

test('cor desconhecida usa o tom neutro', () => {
  assert.equal(obterHexDaCor('Furta-cor'), COR_NEUTRA);
  assert.equal(obterFundoDaCor('Furta-cor'), COR_NEUTRA);
});

test('nome composto usa a primeira cor conhecida como cor principal', () => {
  assert.equal(obterHexDaCor('Preto e Branco'), '#1f1f1f');
  assert.equal(obterHexDaCor('Furta-cor e Rosa'), '#e7a1b0');
});

test('nome composto vira fatias na bolinha de cor', () => {
  assert.equal(
    obterFundoDaCor('Preto e Branco'),
    'linear-gradient(90deg, #1f1f1f 0% 50%, #ffffff 50% 100%)',
  );
  assert.equal(
    obterFundoDaCor('Amarelo, Bege e Marrom'),
    'linear-gradient(90deg, #f1d36b 0% 33.33%, #d9c3a5 33.33% 66.67%, #6b4632 66.67% 100%)',
  );
});

test('não separa nomes que apenas contêm a letra "e"', () => {
  assert.equal(obterFundoDaCor('Verde Menta'), '#b7dcc8');
  assert.equal(obterFundoDaCor('Bege'), '#d9c3a5');
});

test('todas as cores do catálogo inicial são reconhecidas', () => {
  globalThis.window = globalThis;
  require('../js/dados/dados-iniciais.js');
  const coresDoCatalogo = globalThis.Loja.dadosIniciais.produtos.flatMap((produto) => produto.cores);
  const coresSemMapa = coresDoCatalogo.filter((nomeCor) => obterFundoDaCor(nomeCor).includes(COR_NEUTRA));
  assert.deepEqual(coresSemMapa, []);
});
