/**
 * Gera as versões em WebP das fotos de produtos e da logo.
 * Os arquivos originais não são alterados: o JPEG continua sendo usado no zoom e como reserva.
 *
 * Uso: npm run otimizar-fotos
 * Rode sempre que adicionar ou trocar uma foto em img/produtos/.
 */
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const { LARGURAS_FOTO_OTIMIZADA } = require('../js/logica/utilidades.js');

const RAIZ_DO_PROJETO = path.join(__dirname, '..');
const PASTA_PRODUTOS = path.join(RAIZ_DO_PROJETO, 'img', 'produtos');
const PASTA_OTIMIZADAS = path.join(PASTA_PRODUTOS, 'otimizadas');
const PASTA_MARCA = path.join(RAIZ_DO_PROJETO, 'img', 'marca');

const QUALIDADE_WEBP = 80;
const LARGURAS_LOGO = [400, 600];

/** Cria um WebP na largura pedida (sem ampliar fotos menores) e devolve o tamanho em bytes. */
async function gerarWebp(arquivoOriginal, arquivoDestino, largura) {
  const resultado = await sharp(arquivoOriginal)
    .rotate() // respeita a orientação gravada pelo celular
    .resize({ width: largura, withoutEnlargement: true })
    .webp({ quality: QUALIDADE_WEBP })
    .toFile(arquivoDestino);
  return resultado.size;
}

async function otimizarFotosDeProdutos() {
  await fs.mkdir(PASTA_OTIMIZADAS, { recursive: true });
  const arquivos = await fs.readdir(PASTA_PRODUTOS);
  const fotos = arquivos.filter((nomeArquivo) => /\.jpe?g$/i.test(nomeArquivo));
  const totalPorLargura = new Map(LARGURAS_FOTO_OTIMIZADA.map((largura) => [largura, 0]));

  for (const nomeFoto of fotos) {
    const nomeSemExtensao = path.parse(nomeFoto).name;
    for (const largura of LARGURAS_FOTO_OTIMIZADA) {
      const tamanho = await gerarWebp(
        path.join(PASTA_PRODUTOS, nomeFoto),
        path.join(PASTA_OTIMIZADAS, `${nomeSemExtensao}-${largura}.webp`),
        largura,
      );
      totalPorLargura.set(largura, totalPorLargura.get(largura) + tamanho);
    }
  }

  console.log(`${fotos.length} fotos de produtos processadas.`);
  totalPorLargura.forEach((total, largura) => {
    console.log(`  ${largura} px: ${Math.round(total / 1024)} KB no total`);
  });
}

async function otimizarLogo() {
  for (const largura of LARGURAS_LOGO) {
    const tamanho = await gerarWebp(
      path.join(PASTA_MARCA, 'logo.jpeg'),
      path.join(PASTA_MARCA, `logo-${largura}.webp`),
      largura,
    );
    console.log(`Logo ${largura} px: ${Math.round(tamanho / 1024)} KB`);
  }
}

async function executar() {
  await otimizarFotosDeProdutos();
  await otimizarLogo();
}

executar().catch((erro) => {
  console.error('Não foi possível otimizar as fotos.', erro);
  process.exitCode = 1;
});
