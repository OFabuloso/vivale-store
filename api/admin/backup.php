<?php
/**
 * GET api/admin/backup.php — baixa o backup completo da loja (.zip com banco e fotos). Só o dono.
 * Anota a data, para o painel lembrar o dono quando fizer tempo que ele não baixa uma cópia.
 */
declare(strict_types=1);

require __DIR__ . '/../nucleo/inicio.php';
require __DIR__ . '/../nucleo/fotos.php';
require __DIR__ . '/../nucleo/backup.php';

$dono = exigirDono();
if (metodoDaRequisicao() !== 'GET') {
    recusarMetodo();
}

$caminhoZip = tempnam(sys_get_temp_dir(), 'vivale-backup-');
try {
    gerarBackupCompleto($caminhoZip);
    registrarDataDoBackup('ultimoBackupBaixado');
    registrarAuditoria((int) $dono['id'], 'backup_baixado', ['tamanho' => filesize($caminhoZip)]);

    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="' . nomeDoArquivoDeBackup() . '"');
    header('Content-Length: ' . filesize($caminhoZip));
    header('Cache-Control: no-store');
    readfile($caminhoZip);
} finally {
    @unlink($caminhoZip);
}
