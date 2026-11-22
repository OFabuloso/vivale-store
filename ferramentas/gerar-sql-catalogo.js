/**
 * Gera api/sql/002_catalogo_inicial.sql a partir de js/dados/dados-iniciais.js:
 * os produtos, os contatos de WhatsApp e o valor mínimo que a loja usa hoje.
 *
 * Uso: npm run gerar-sql-catalogo
 * Rode de novo se o dados-iniciais.js mudar antes de o banco ser criado.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ_DO_PROJETO = path.join(__dirname, '..');
const ARQUIVO_DADOS = path.join(RAIZ_DO_PROJETO, 'js', 'dados', 'dados-iniciais.js');
const ARQUIVO_SQL = path.join(RAIZ_DO_PROJETO, 'api', 'sql', '002_catalogo_inicial.sql');

/** Executa o dados-iniciais.js num ambiente isolado e devolve o objeto que ele cria. */
function lerDadosIniciais(caminhoArquivo) {
  const ambiente = { window: {} };
  vm.runInNewContext(fs.readFileSync(caminhoArquivo, 'utf8'), ambiente);
  return ambiente.window.Loja.dadosIniciais;
}

/** Texto entre aspas simples, no formato aceito pelo MySQL e pelo MariaDB. */
function textoSql(valor) {
  return `'${String(valor).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function montarInsercaoProduto(produto, posicao) {
  const colunas = [
    textoSql(produto.id),
    textoSql(produto.nome),
    textoSql(produto.descricao || ''),
    textoSql(produto.categoria),
    Number(produto.preco).toFixed(2),
    textoSql(produto.foto || ''),
    textoSql(JSON.stringify(produto.tamanhos)),
    textoSql(JSON.stringify(produto.cores)),
    produto.ativo === false ? 0 : 1,
    posicao,
  ];
  return `  (${colunas.join(', ')})`;
}

function montarInsercaoContato(contato, posicao) {
  const colunas = [
    textoSql(contato.id),
    textoSql(contato.nome),
    textoSql(contato.numero),
    contato.ativo === false ? 0 : 1,
    posicao,
  ];
  return `  (${colunas.join(', ')})`;
}

function gerarSql(dadosIniciais) {
  const { produtos, configuracao } = dadosIniciais;
  return [
    '-- Carga inicial gerada por ferramentas/gerar-sql-catalogo.js a partir de js/dados/dados-iniciais.js.',
    '-- Importe pelo phpMyAdmin depois do 001_inicial.sql.',
    '',
    'SET NAMES utf8mb4;',
    '',
    'INSERT INTO produtos (id, nome, descricao, categoria, preco, foto, tamanhos, cores, ativo, ordem) VALUES',
    `${produtos.map(montarInsercaoProduto).join(',\n')};`,
    '',
    'INSERT INTO contatos (id, nome, numero, ativo, ordem) VALUES',
    `${configuracao.contatosWhatsApp.map(montarInsercaoContato).join(',\n')};`,
    '',
    'INSERT INTO configuracoes (chave, valor) VALUES',
    `  ('valorMinimo', ${textoSql(JSON.stringify(configuracao.valorMinimo))});`,
    '',
  ].join('\n');
}

if (require.main === module) {
  const dadosIniciais = lerDadosIniciais(ARQUIVO_DADOS);
  fs.writeFileSync(ARQUIVO_SQL, gerarSql(dadosIniciais));
  console.log(
    `Gerado ${path.relative(RAIZ_DO_PROJETO, ARQUIVO_SQL)}: ` +
      `${dadosIniciais.produtos.length} produtos e ` +
      `${dadosIniciais.configuracao.contatosWhatsApp.length} contato(s).`,
  );
}

module.exports = { lerDadosIniciais, textoSql, gerarSql };
