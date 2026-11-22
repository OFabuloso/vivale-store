<?php
/**
 * POST api/admin/fotos.php — recebe uma foto (campo "foto", multipart/form-data) e devolve
 * { foto: "fotos/<nome>.jpg" } para usar no produto. Precisa de login.
 */
declare(strict_types=1);

require __DIR__ . '/../nucleo/inicio.php';
require __DIR__ . '/../nucleo/fotos.php';

$usuario = exigirUsuarioLogado();
if (metodoDaRequisicao() !== 'POST') {
    recusarMetodo();
}

$enderecoFoto = salvarFotoEnviada($_FILES['foto'] ?? []);
registrarAuditoria((int) $usuario['id'], 'foto_enviada', ['foto' => $enderecoFoto]);
responderJson(['foto' => $enderecoFoto], 201);
