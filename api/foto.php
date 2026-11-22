<?php
/**
 * Entrega as fotos enviadas pelo painel. O .htaccess traduz "fotos/<nome>" para
 * "api/foto.php?arquivo=<nome>". Só nomes gerados pelo servidor são aceitos.
 */
declare(strict_types=1);

require __DIR__ . '/nucleo/resposta.php';
require __DIR__ . '/nucleo/config.php';
require __DIR__ . '/nucleo/fotos.php';

$nomeArquivo = (string) ($_GET['arquivo'] ?? '');
$caminhoArquivo = obterConfiguracao()['pasta_uploads'] . '/' . $nomeArquivo;

if (preg_match(PADRAO_NOME_DE_FOTO, $nomeArquivo) !== 1 || !is_file($caminhoArquivo)) {
    http_response_code(404);
    exit;
}

header('Content-Type: ' . (str_ends_with($nomeArquivo, '.webp') ? 'image/webp' : 'image/jpeg'));
header('Content-Length: ' . filesize($caminhoArquivo));
header('X-Content-Type-Options: nosniff');
// O nome muda a cada envio, então a foto pode ficar guardada no navegador por um ano
header('Cache-Control: public, max-age=31536000, immutable');
readfile($caminhoArquivo);
