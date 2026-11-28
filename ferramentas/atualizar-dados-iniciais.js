/**
 * Atualiza js/dados/dados-iniciais.js com o catálogo que está no ar (produtos, atendentes
 * ligados e valor mínimo). Esse arquivo é a reserva da loja: só é usado se a cliente abrir o
 * site pela primeira vez justo quando o servidor estiver fora do ar.
 *
 * Uso: npm run atualizar-dados-iniciais
 * (opcional: ENDERECO_LOJA=http://localhost:8081 npm run atualizar-dados-iniciais)
 * Rode antes de publicar quando o catálogo tiver mudado bastante.
 */
const fs = require('node:fs');
const path = require('node:path');

const { lerDadosIniciais } = require('./gerar-sql-catalogo.js');

const RAIZ_DO_PROJETO = path.join(__dirname, '..');
const ARQUIVO_DADOS = path.join(RAIZ_DO_PROJETO, 'js', 'dados', 'dados-iniciais.js');
const ENDERECO_LOJA = process.env.ENDERECO_LOJA || 'https://vivalestore.com.br';

const CABECALHO = `/**
 * Catálogo de reserva da loja, gerado por ferramentas/atualizar-dados-iniciais.js a partir do
 * catálogo no ar. A loja lê o catálogo do servidor; este arquivo só é usado se a cliente abrir
 * o site pela primeira vez justo quando o servidor estiver fora do ar.
 * Não edite à mão: rode "npm run atualizar-dados-iniciais".
 *
 * "versao" sobe a cada atualização: navegadores com uma cópia mais antiga trocam por esta.
 */`;

/**
 * Monta o conteúdo do arquivo. Fica de fora o que muda o tempo todo e não deve travar a
 * reserva (variações esgotadas) e o que é só do painel (atendente desligado nem aparece).
 */
function montarArquivoDadosIniciais(catalogo, versaoAnterior) {
  if (!Array.isArray(catalogo.produtos) || catalogo.produtos.length === 0) {
    throw new Error('O catálogo do servidor veio sem produtos: o arquivo de reserva não foi alterado.');
  }
  const dadosIniciais = {
    versao: (Number(versaoAnterior) || 0) + 1,
    configuracao: {
      contatosWhatsApp: catalogo.configuracao.contatosWhatsApp.map(({ id, nome, numero }) => ({ id, nome, numero })),
      valorMinimo: catalogo.configuracao.valorMinimo,
    },
    produtos: catalogo.produtos.map(({ id, nome, descricao, categoria, preco, foto, fotosPorCor, tamanhos, cores, ativo }) => ({
      id,
      nome,
      descricao,
      categoria,
      preco,
      foto,
      // Só aparece quando alguma cor tem foto própria, para o arquivo não crescer à toa
      ...(fotosPorCor && Object.keys(fotosPorCor).length ? { fotosPorCor } : {}),
      tamanhos,
      cores,
      ativo,
    })),
  };
  return `${CABECALHO}\nwindow.Loja = window.Loja || {};\nwindow.Loja.dadosIniciais = ${JSON.stringify(dadosIniciais, null, 2)};\n`;
}

async function atualizar() {
  const resposta = await fetch(`${ENDERECO_LOJA}/api/catalogo.php`);
  if (!resposta.ok) throw new Error(`O servidor respondeu ${resposta.status}.`);
  const catalogo = await resposta.json();
  const versaoAnterior = lerDadosIniciais(ARQUIVO_DADOS).versao;
  fs.writeFileSync(ARQUIVO_DADOS, montarArquivoDadosIniciais(catalogo, versaoAnterior));
  console.log(
    `Atualizado ${path.relative(RAIZ_DO_PROJETO, ARQUIVO_DADOS)} (versão ${versaoAnterior + 1}): ` +
      `${catalogo.produtos.length} produtos, ${catalogo.configuracao.contatosWhatsApp.length} atendente(s), ` +
      `mínimo de R$ ${catalogo.configuracao.valorMinimo}.`,
  );
}

if (require.main === module) {
  atualizar().catch((erro) => {
    console.error(`Não foi possível atualizar: ${erro.message}`);
    process.exit(1);
  });
}

module.exports = { montarArquivoDadosIniciais };
