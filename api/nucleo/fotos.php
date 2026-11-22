<?php
/**
 * Fotos enviadas pelo painel. Ficam na pasta "uploads", fora da public_html
 * (o deploy pelo Git não apaga), e são entregues por api/foto.php no endereço fotos/<nome>.
 *
 * Toda foto é redesenhada com o GD: isso descarta metadados (como a localização do celular)
 * e qualquer conteúdo escondido no arquivo. São geradas as mesmas versões das fotos do projeto:
 * um JPEG para o zoom e WebPs leves de 400 e 600 px (ver ferramentas/otimizar-fotos.js).
 */
declare(strict_types=1);

const TAMANHO_MAXIMO_UPLOAD_BYTES = 8 * 1024 * 1024;
const LIMITE_DE_PIXELS = 40_000_000;
const LARGURA_JPEG = 1200;
const QUALIDADE_JPEG = 82;
const LARGURAS_WEBP = [400, 600];
const QUALIDADE_WEBP = 80;
const PADRAO_NOME_DE_FOTO = '/^[a-f0-9]{32}(?:\.jpg|-(?:400|600)\.webp)$/';

function pastaDeUploads(): string
{
    $pasta = obterConfiguracao()['pasta_uploads'];
    if (!is_dir($pasta) || !is_writable($pasta)) {
        throw new RuntimeException('A pasta de uploads não existe ou não aceita gravação: ' . $pasta);
    }
    return $pasta;
}

/** Abre a imagem enviada já conferindo o tipo real do arquivo (não confia na extensão). */
function abrirImagemEnviada(string $caminhoTemporario): GdImage
{
    $tipoReal = (new finfo(FILEINFO_MIME_TYPE))->file($caminhoTemporario);
    $dimensoes = @getimagesize($caminhoTemporario);
    if (!in_array($tipoReal, ['image/jpeg', 'image/png', 'image/webp'], true) || $dimensoes === false) {
        throw new ErroDaApi(422, 'Envie uma foto em JPEG, PNG ou WebP.');
    }
    if ($dimensoes[0] * $dimensoes[1] > LIMITE_DE_PIXELS) {
        throw new ErroDaApi(422, 'A foto tem resolução grande demais.');
    }

    $imagem = match ($tipoReal) {
        'image/jpeg' => @imagecreatefromjpeg($caminhoTemporario),
        'image/png' => @imagecreatefrompng($caminhoTemporario),
        'image/webp' => @imagecreatefromwebp($caminhoTemporario),
    };
    if (!$imagem instanceof GdImage) {
        throw new ErroDaApi(422, 'Não foi possível ler a foto. Tente outro arquivo.');
    }
    return $tipoReal === 'image/jpeg' ? corrigirOrientacao($imagem, $caminhoTemporario) : $imagem;
}

/** Fotos de celular guardam a rotação nos metadados; aplica a rotação antes de descartá-los. */
function corrigirOrientacao(GdImage $imagem, string $caminhoArquivo): GdImage
{
    $metadados = function_exists('exif_read_data') ? @exif_read_data($caminhoArquivo) : false;
    $angulo = match ((int) ($metadados['Orientation'] ?? 1)) {
        3 => 180,
        6 => -90,
        8 => 90,
        default => 0,
    };
    return $angulo === 0 ? $imagem : imagerotate($imagem, $angulo, 0);
}

/** Cópia da imagem com a largura pedida (sem ampliar), sobre fundo branco. */
function redimensionar(GdImage $imagem, int $larguraMaxima): GdImage
{
    $larguraOriginal = imagesx($imagem);
    $alturaOriginal = imagesy($imagem);
    $escala = min(1, $larguraMaxima / $larguraOriginal);
    $novaLargura = max(1, (int) round($larguraOriginal * $escala));
    $novaAltura = max(1, (int) round($alturaOriginal * $escala));

    $copia = imagecreatetruecolor($novaLargura, $novaAltura);
    imagefill($copia, 0, 0, imagecolorallocate($copia, 255, 255, 255));
    imagecopyresampled($copia, $imagem, 0, 0, 0, 0, $novaLargura, $novaAltura, $larguraOriginal, $alturaOriginal);
    return $copia;
}

/** Processa o arquivo enviado e devolve o endereço da foto, ex.: "fotos/<nome>.jpg". */
function salvarFotoEnviada(array $arquivoEnviado): string
{
    if (($arquivoEnviado['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        $mensagem = in_array($arquivoEnviado['error'] ?? null, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)
            ? 'A foto passa de 8 MB.'
            : 'Nenhuma foto foi recebida. Tente de novo.';
        throw new ErroDaApi(422, $mensagem);
    }
    if ($arquivoEnviado['size'] > TAMANHO_MAXIMO_UPLOAD_BYTES) {
        throw new ErroDaApi(422, 'A foto passa de 8 MB.');
    }
    if (!is_uploaded_file($arquivoEnviado['tmp_name'])) {
        throw new ErroDaApi(422, 'Nenhuma foto foi recebida. Tente de novo.');
    }

    $imagem = abrirImagemEnviada($arquivoEnviado['tmp_name']);
    $pasta = pastaDeUploads();
    $nomeDaFoto = bin2hex(random_bytes(16));

    imagejpeg(redimensionar($imagem, LARGURA_JPEG), "{$pasta}/{$nomeDaFoto}.jpg", QUALIDADE_JPEG);
    foreach (LARGURAS_WEBP as $largura) {
        imagewebp(redimensionar($imagem, $largura), "{$pasta}/{$nomeDaFoto}-{$largura}.webp", QUALIDADE_WEBP);
    }
    return "fotos/{$nomeDaFoto}.jpg";
}
