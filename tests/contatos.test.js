const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  NOME_CONTATO_PADRAO,
  resolverContatos,
  filtrarContatosAtivos,
  validarContatos,
  formatarTelefone,
} = require('../js/logica/contatos.js');

const contatoVendas = { id: 'contato-a', nome: 'Vendas', numero: '5521979396729', ativo: true };

test('usa os contatos salvos quando existem', () => {
  const contatos = resolverContatos({ contatosWhatsApp: [contatoVendas] }, { numeroWhatsApp: '11999998888' });
  assert.deepEqual(contatos, [contatoVendas]);
});

test('converte o número único das versões antigas em um contato', () => {
  const contatos = resolverContatos({ numeroWhatsApp: '(11) 99999-8888' }, { contatosWhatsApp: [contatoVendas] });
  assert.deepEqual(contatos, [
    { id: 'contato-principal', nome: NOME_CONTATO_PADRAO, numero: '5511999998888', ativo: true },
  ]);
});

test('recorre aos dados iniciais quando nada foi salvo', () => {
  assert.deepEqual(resolverContatos({}, { contatosWhatsApp: [contatoVendas] }), [contatoVendas]);
  assert.deepEqual(resolverContatos(null, {}), []);
});

test('ignora lista salva vazia e itens malformados', () => {
  assert.deepEqual(resolverContatos({ contatosWhatsApp: [] }, { contatosWhatsApp: [contatoVendas] }), [contatoVendas]);
  assert.deepEqual(resolverContatos({ contatosWhatsApp: [null, contatoVendas] }, {}), [contatoVendas]);
});

test('valida, normaliza e mantém a ordem dos contatos', () => {
  const resultado = validarContatos([
    { id: 'contato-a', nome: '  Vendas  ', numero: '(21) 97939-6729' },
    { nome: 'Gerência', numero: '21 3333-4444' },
  ]);
  assert.equal(resultado.erro, undefined);
  assert.deepEqual(resultado.contatos[0], { id: 'contato-a', nome: 'Vendas', numero: '5521979396729', ativo: true });
  assert.equal(resultado.contatos[1].numero, '552133334444');
  assert.match(resultado.contatos[1].id, /^contato-/);
});

test('recusa lista vazia, nome vazio, número inválido e número repetido', () => {
  assert.match(validarContatos([]).erro, /pelo menos um/);
  assert.match(validarContatos([{ nome: ' ', numero: '21979396729' }]).erro, /nome do contato 1/);
  assert.match(validarContatos([{ nome: 'Vendas', numero: '1234' }]).erro, /inválido/);
  const repetido = validarContatos([
    { nome: 'Vendas', numero: '21979396729' },
    { nome: 'Gerência', numero: '+55 21 97939-6729' },
  ]);
  assert.match(repetido.erro, /Gerência/);
});

test('formata o número no padrão brasileiro', () => {
  assert.equal(formatarTelefone('5521979396729'), '(21) 97939-6729');
  assert.equal(formatarTelefone('552133334444'), '(21) 3333-4444');
  assert.equal(formatarTelefone('1234'), '+1234');
  assert.equal(formatarTelefone(''), '');
});

test('contatos salvos sem o campo ativo (versões antigas) contam como ligados', () => {
  const contatosResolvidos = resolverContatos(
    { contatosWhatsApp: [{ id: 'contato-a', nome: 'Vendas', numero: '5521979396729' }] },
    {},
  );
  assert.equal(contatosResolvidos[0].ativo, true);
});

test('mantém o contato desligado ao ler e ao validar', () => {
  const contatoDesligado = { id: 'contato-b', nome: 'Gerência', numero: '5521933334444', ativo: false };
  assert.equal(resolverContatos({ contatosWhatsApp: [contatoDesligado] }, {})[0].ativo, false);
  assert.equal(validarContatos([contatoDesligado]).contatos[0].ativo, false);
});

test('a cliente só vê os contatos ligados', () => {
  const contatoDesligado = { id: 'contato-b', nome: 'Gerência', numero: '5521933334444', ativo: false };
  const contatoAntigo = { id: 'contato-c', nome: 'Loja', numero: '5521944445555' };
  assert.deepEqual(filtrarContatosAtivos([contatoVendas, contatoDesligado, contatoAntigo]), [
    contatoVendas,
    contatoAntigo,
  ]);
  assert.deepEqual(filtrarContatosAtivos([contatoDesligado]), []);
});
