const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const { montarArquivoDadosIniciais } = require('../ferramentas/atualizar-dados-iniciais.js');

const catalogoDoServidor = {
  produtos: [
    { id: 'prd-1', nome: 'Vestido', descricao: '', categoria: 'Vestidos', preco: 65, foto: 'fotos/abc.jpg', fotosPorCor: {}, tamanhos: ['P'], cores: ['Azul'], ativo: true, esgotados: ['P|Azul'] },
    { id: 'prd-2', nome: 'Corset', descricao: '', categoria: 'Corsets', preco: 80, foto: 'fotos/def.jpg', fotosPorCor: { Pink: 'fotos/ghi.jpg' }, tamanhos: ['U'], cores: ['Preto', 'Pink'], ativo: true, esgotados: [] },
  ],
  configuracao: { contatosWhatsApp: [{ id: 'contato-1', nome: 'Elaine', numero: '5521900000000', ativo: true }], valorMinimo: 200 },
};

/** Roda o arquivo gerado como o navegador faria e devolve o catálogo de reserva. */
function executarArquivo(conteudo) {
  const ambiente = { window: {} };
  vm.runInNewContext(conteudo, ambiente);
  // Os objetos criados no ambiente isolado têm outro protótipo: compara só o conteúdo
  return JSON.parse(JSON.stringify(ambiente.window.Loja.dadosIniciais));
}

test('gera o catálogo de reserva com a versão seguinte, sem esgotados e sem campos do painel', () => {
  const dadosIniciais = executarArquivo(montarArquivoDadosIniciais(catalogoDoServidor, 5));
  assert.equal(dadosIniciais.versao, 6);
  assert.equal(dadosIniciais.configuracao.valorMinimo, 200);
  assert.deepEqual(dadosIniciais.configuracao.contatosWhatsApp, [{ id: 'contato-1', nome: 'Elaine', numero: '5521900000000' }]);
  assert.equal(dadosIniciais.produtos.length, 2);
  assert.equal(dadosIniciais.produtos[0].esgotados, undefined);
  assert.equal(dadosIniciais.produtos[0].foto, 'fotos/abc.jpg');
  // A foto de cada cor vai junto só quando existe
  assert.equal(dadosIniciais.produtos[0].fotosPorCor, undefined);
  assert.deepEqual(dadosIniciais.produtos[1].fotosPorCor, { Pink: 'fotos/ghi.jpg' });
});

test('catálogo vazio do servidor não apaga a reserva', () => {
  assert.throws(() => montarArquivoDadosIniciais({ ...catalogoDoServidor, produtos: [] }, 5), /sem produtos/);
});
