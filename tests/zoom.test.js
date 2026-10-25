const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  ESCALA_MAXIMA,
  ESCALA_TOQUE_DUPLO,
  limitarEscala,
  calcularDistancia,
  calcularEscalaDaPinca,
  limitarDeslocamento,
  calcularTamanhoExibido,
  alternarZoomDoToqueDuplo,
} = require('../js/logica/zoom.js');

test('limita a escala entre 1x e o máximo', () => {
  assert.equal(limitarEscala(0.5), 1);
  assert.equal(limitarEscala(2.2), 2.2);
  assert.equal(limitarEscala(10), ESCALA_MAXIMA);
  assert.equal(limitarEscala(Number.NaN), 1);
});

test('calcula a distância entre dois dedos', () => {
  assert.equal(calcularDistancia({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});

test('pinça amplia na proporção em que os dedos se afastam', () => {
  assert.equal(calcularEscalaDaPinca(1, 100, 200), 2);
  assert.equal(calcularEscalaDaPinca(2, 100, 50), 1);
  assert.equal(calcularEscalaDaPinca(3, 100, 400), ESCALA_MAXIMA);
  assert.equal(calcularEscalaDaPinca(1.5, 0, 80), 1.5);
});

test('não deixa arrastar a foto para fora da área', () => {
  // Em 2x numa área de 400px sobram 200px de cada lado: o limite é 200
  assert.equal(limitarDeslocamento(150, 2, 400), 150);
  assert.equal(limitarDeslocamento(500, 2, 400), 200);
  assert.equal(limitarDeslocamento(-500, 2, 400), -200);
  // Sem zoom a foto não se move
  assert.equal(limitarDeslocamento(-30, 1, 400), 0);
});

test('foto menor que a área só pode ser arrastada no quanto passar da borda', () => {
  // Foto de 500px de altura numa tela de 800px: em 2x fica com 1000px e passa 100px de cada lado
  assert.equal(limitarDeslocamento(400, 2, 800, 500), 100);
  // Em 1,5x (750px) ainda cabe inteira: fica centralizada
  assert.equal(limitarDeslocamento(-50, 1.5, 800, 500), 0);
});

test('calcula o tamanho da foto encaixada inteira na área', () => {
  // Foto 3:4 (900x1200) numa tela 390x700: a largura limita
  assert.deepEqual(calcularTamanhoExibido({ largura: 900, altura: 1200 }, { largura: 390, altura: 700 }), {
    largura: 390,
    altura: 520,
  });
  // Foto ainda não carregada: usa a área inteira
  assert.deepEqual(calcularTamanhoExibido({ largura: 0, altura: 0 }, { largura: 390, altura: 700 }), {
    largura: 390,
    altura: 700,
  });
});

test('toque duplo não deixa aparecer borda vazia acima ou abaixo da foto', () => {
  // Foto de 520px numa área de 700px: em 2,5x passa (1300 - 700) / 2 = 300px de cada lado
  const resultado = alternarZoomDoToqueDuplo(1, { x: 0, y: -300 }, { largura: 390, altura: 700 }, { largura: 390, altura: 520 });
  assert.equal(resultado.deslocamentoY, 300);
});

test('toque duplo amplia mantendo o ponto tocado no lugar', () => {
  const resultado = alternarZoomDoToqueDuplo(1, { x: 40, y: -20 }, { largura: 400, altura: 600 });
  assert.equal(resultado.escala, ESCALA_TOQUE_DUPLO);
  assert.equal(resultado.deslocamentoX, -60);
  assert.equal(resultado.deslocamentoY, 30);
});

test('toque duplo com a foto ampliada volta ao tamanho normal', () => {
  assert.deepEqual(alternarZoomDoToqueDuplo(2.5, { x: 10, y: 10 }, { largura: 400, altura: 600 }), {
    escala: 1,
    deslocamentoX: 0,
    deslocamentoY: 0,
  });
});
