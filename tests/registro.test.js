const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { GRUPOS_DE_ACOES, descreverAcao, listarAcoesDoGrupo } = require('../js/logica/registro.js');
const { formatarMoeda } = require('../js/logica/utilidades.js');

test('descreve as ações em português, com os detalhes gravados', () => {
  assert.equal(descreverAcao({ acao: 'produto_salvo', detalhes: { id: 'prd-1', nome: 'Vestido Midi' } }), 'Salvou o produto "Vestido Midi"');
  assert.equal(descreverAcao({ acao: 'venda_balcao', detalhes: { pedido: 44, forma: 'pix' } }), 'Registrou a venda nº 44 no balcão (Pix)');
  assert.equal(descreverAcao({ acao: 'configuracao_salva', detalhes: { valorMinimo: 200 } }), `Mudou o pedido mínimo para ${formatarMoeda(200)}`);
  assert.equal(
    descreverAcao({ acao: 'contatos_salvos', detalhes: { ligados: ['Elaine', 'Cris'], desligados: [] } }),
    'Alterou os atendentes do WhatsApp (ligados: Elaine, Cris; desligados: nenhum)',
  );
  assert.equal(descreverAcao({ acao: 'status_alterado', detalhes: { status: 'pausa' } }), 'Mudou o status para Pausa');
  assert.equal(descreverAcao({ acao: 'acao_nova_qualquer', detalhes: {} }), 'acao_nova_qualquer');
});

test('toda ação que o servidor grava tem frase e está em algum grupo do filtro', () => {
  // Lê as ações direto do código PHP, para o teste avisar quando surgir uma ação nova
  const pastaApi = path.join(__dirname, '..', 'api');
  const arquivosPhp = fs.readdirSync(pastaApi, { recursive: true }).filter((arquivo) => arquivo.endsWith('.php'));
  const acoesGravadas = new Set();
  for (const arquivo of arquivosPhp) {
    const codigo = fs.readFileSync(path.join(pastaApi, arquivo), 'utf8');
    // O nome da ação é o segundo argumento: registrarAuditoria($quem, 'acao', ...)
    for (const resultado of codigo.matchAll(/registrarAuditoria\([^,]+,\s*'([a-z_]+)'/g)) acoesGravadas.add(resultado[1]);
    for (const resultado of codigo.matchAll(/\? '([a-z_]+)' : '([a-z_]+)'/g)) acoesGravadas.add(resultado[1]).add(resultado[2]);
  }
  const acoesNosGrupos = new Set(Object.values(GRUPOS_DE_ACOES).flatMap((grupo) => grupo.acoes));
  assert.ok(acoesGravadas.size >= 20, `achou só ${acoesGravadas.size} ações`);
  for (const acao of acoesGravadas) {
    assert.notEqual(descreverAcao({ acao, detalhes: {} }), acao, `falta a frase de "${acao}"`);
    assert.ok(acoesNosGrupos.has(acao), `"${acao}" não está em nenhum grupo do filtro`);
  }
});

test('grupo do filtro devolve as ações dele; vazio ou desconhecido devolve nenhuma (= todas)', () => {
  assert.deepEqual(listarAcoesDoGrupo('vendas'), ['venda_balcao', 'pedido_vendido', 'pedido_cancelado']);
  assert.deepEqual(listarAcoesDoGrupo(''), []);
  assert.deepEqual(listarAcoesDoGrupo('inventado'), []);
});
