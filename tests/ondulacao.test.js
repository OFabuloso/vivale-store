const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  MAXIMO_DE_ONDAS,
  DURACAO_DA_ONDA_MS,
  DURACAO_DO_BRILHO_MS,
  DISTANCIA_ENTRE_ONDAS,
  calcularForcaDaOnda,
  calcularIntensidadeDoBrilho,
  registrarOnda,
  removerOndasExpiradas,
  animacaoAindaAtiva,
  suavizarValor,
  calcularEscalaCover,
  renderizadorPorSoftware,
} = require('../js/logica/ondulacao.js');

test('a onda nasce fraca, ganha força e termina zerada', () => {
  assert.equal(calcularForcaDaOnda(0), 0);
  assert.equal(calcularForcaDaOnda(-10), 0);
  assert.equal(calcularForcaDaOnda(180), 1);
  assert.ok(calcularForcaDaOnda(90) > 0 && calcularForcaDaOnda(90) < 1);
  assert.ok(calcularForcaDaOnda(1000) < calcularForcaDaOnda(500));
  assert.equal(calcularForcaDaOnda(DURACAO_DA_ONDA_MS), 0);
});

test('o brilho apaga aos poucos depois que o mouse para', () => {
  assert.equal(calcularIntensidadeDoBrilho(0), 1);
  assert.equal(calcularIntensidadeDoBrilho(-5), 1);
  assert.equal(calcularIntensidadeDoBrilho(DURACAO_DO_BRILHO_MS / 2), 0.5);
  assert.equal(calcularIntensidadeDoBrilho(DURACAO_DO_BRILHO_MS), 0);
  assert.equal(calcularIntensidadeDoBrilho(Infinity), 0);
});

test('não cria onda enquanto o mouse estiver perto da anterior', () => {
  const primeira = registrarOnda([], { horizontal: 0.5, vertical: 0.5 }, 100, 1);
  assert.equal(primeira.length, 1);
  const perto = { horizontal: 0.5, vertical: 0.5 + DISTANCIA_ENTRE_ONDAS / 2 };
  assert.equal(registrarOnda(primeira, perto, 200, 1).length, 1);
  const longe = { horizontal: 0.5, vertical: 0.5 + DISTANCIA_ENTRE_ONDAS * 2 };
  assert.equal(registrarOnda(primeira, longe, 200, 1).length, 2);
});

test('a distância considera a proporção da tela', () => {
  const inicial = registrarOnda([], { horizontal: 0.5, vertical: 0.5 }, 0, 1);
  const deslocada = { horizontal: 0.5 + DISTANCIA_ENTRE_ONDAS / 2, vertical: 0.5 };
  assert.equal(registrarOnda(inicial, deslocada, 10, 1).length, 1);
  assert.equal(registrarOnda(inicial, deslocada, 10, 16 / 9).length, 1);
  assert.equal(registrarOnda(inicial, deslocada, 10, 3).length, 2);
});

test('guarda só as ondas mais recentes, sem alterar a lista recebida', () => {
  let ondas = [];
  for (let indice = 0; indice < MAXIMO_DE_ONDAS + 3; indice += 1) {
    ondas = registrarOnda(ondas, { horizontal: 0, vertical: indice }, indice, 1);
  }
  assert.equal(ondas.length, MAXIMO_DE_ONDAS);
  assert.equal(ondas[ondas.length - 1].inicio, MAXIMO_DE_ONDAS + 2);
  assert.equal(ondas[0].inicio, 3);

  const original = [{ horizontal: 0, vertical: 0, inicio: 0 }];
  registrarOnda(original, { horizontal: 1, vertical: 1 }, 5, 1);
  assert.equal(original.length, 1);
});

test('remove as ondas que já terminaram', () => {
  const ondas = [
    { horizontal: 0, vertical: 0, inicio: 0 },
    { horizontal: 1, vertical: 1, inicio: 500 },
  ];
  assert.equal(removerOndasExpiradas(ondas, DURACAO_DA_ONDA_MS - 1).length, 2);
  assert.equal(removerOndasExpiradas(ondas, DURACAO_DA_ONDA_MS).length, 1);
  assert.equal(removerOndasExpiradas(ondas, DURACAO_DA_ONDA_MS + 500).length, 0);
});

test('a animação termina quando não há mais ondas nem brilho', () => {
  const ondas = [{ horizontal: 0, vertical: 0, inicio: 0 }];
  assert.equal(animacaoAindaAtiva(ondas, 100, 0), true);
  assert.equal(animacaoAindaAtiva([], 100, 0), true);
  const fim = Math.max(DURACAO_DA_ONDA_MS, DURACAO_DO_BRILHO_MS);
  assert.equal(animacaoAindaAtiva(ondas, fim, 0), false);
  assert.equal(animacaoAindaAtiva([], 0, -Infinity), false);
});

test('a suavização aproxima do alvo sem ultrapassá-lo', () => {
  assert.equal(suavizarValor(0, 1, 0), 0);
  assert.equal(suavizarValor(0, 1, -50), 0);
  const parcial = suavizarValor(0, 1, 100);
  assert.ok(parcial > 0 && parcial < 1);
  assert.ok(suavizarValor(0, 1, 500) > parcial);
  assert.ok(suavizarValor(0, 1, 1e6) <= 1);
});

test('reconhece o desenho sem placa de vídeo pelo nome do renderizador', () => {
  assert.equal(renderizadorPorSoftware('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'), true);
  assert.equal(renderizadorPorSoftware('llvmpipe (LLVM 15.0.7, 256 bits)'), true);
  assert.equal(renderizadorPorSoftware('ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11)'), true);
  assert.equal(renderizadorPorSoftware('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)'), false);
  assert.equal(renderizadorPorSoftware('Apple M1'), false);
  assert.equal(renderizadorPorSoftware(null), false);
});

test('a escala corta a imagem como o background-size: cover', () => {
  assert.deepEqual(calcularEscalaCover(1920, 1200, 1920, 1200), { horizontal: 1, vertical: 1 });
  const telaLarga = calcularEscalaCover(1600, 800, 1600, 1000);
  assert.equal(telaLarga.horizontal, 1);
  assert.equal(telaLarga.vertical, 0.8);
  const telaEstreita = calcularEscalaCover(800, 1000, 1600, 1000);
  assert.equal(telaEstreita.horizontal, 0.5);
  assert.equal(telaEstreita.vertical, 1);
});
