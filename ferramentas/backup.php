<?php
/**
 * Cópia automática diária da loja (banco + fotos). Só roda no terminal ou pelo cron, nunca pelo site.
 *
 * No hPanel (Avançado > Cron Jobs), uma vez por dia:
 *   /usr/bin/php /home/u151095779/domains/vivalestore.com.br/public_html/ferramentas/backup.php
 * Os arquivos ficam em domains/vivalestore.com.br/backups (fora da public_html); os 14 mais
 * recentes são guardados e os mais antigos, apagados.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../api/nucleo/resposta.php';
require __DIR__ . '/../api/nucleo/config.php';
require __DIR__ . '/../api/nucleo/banco.php';
require __DIR__ . '/../api/nucleo/fotos.php';
require __DIR__ . '/../api/nucleo/backup.php';

try {
    $pastaBackups = pastaDeBackups();
    $caminhoZip = $pastaBackups . '/' . nomeDoArquivoDeBackup();
    gerarBackupCompleto($caminhoZip);
    apagarBackupsAntigos($pastaBackups);
    registrarDataDoBackup('ultimoBackupAutomatico');
    fwrite(STDOUT, 'Backup criado: ' . $caminhoZip . ' (' . round(filesize($caminhoZip) / 1024) . " KB)\n");
} catch (Throwable $erro) {
    // A mensagem vai para o e-mail do cron, se a Hostinger estiver configurada para avisar
    fwrite(STDERR, 'Falha no backup: ' . $erro->getMessage() . "\n");
    exit(1);
}
