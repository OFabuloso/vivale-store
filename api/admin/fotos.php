<?php
/**
 * Fotos enviadas pelo painel.
 *   POST   → recebe uma foto (campo "foto", multipart/form-data) e devolve
 *            { foto: "fotos/<nome>.jpg" } para usar no produto. Precisa de login.
 *   GET    → { quantidade, bytes } das fotos que nenhum produto usa (só o dono)
 *   DELETE → apaga essas fotos e devolve quantas eram (só o dono)
 */
declare(strict_types=1);

require __DIR__ . '/../nucleo/inicio.php';
require __DIR__ . '/../nucleo/fotos.php';

if (metodoDaRequisicao() === 'GET' || metodoDaRequisicao() === 'DELETE') {
    $dono = exigirDono();
    if (metodoDaRequisicao() === 'GET') {
        $semUso = listarFotosSemUso();
    } else {
        $semUso = apagarFotosSemUso();
        registrarAuditoria((int) $dono['id'], 'fotos_sem_uso_apagadas', ['quantidade' => $semUso['quantidade'], 'bytes' => $semUso['bytes']]);
    }
    responderJson(['quantidade' => $semUso['quantidade'], 'bytes' => $semUso['bytes']]);
}

$usuario = exigirUsuarioLogado();
if (metodoDaRequisicao() !== 'POST') {
    recusarMetodo();
}

$enderecoFoto = salvarFotoEnviada($_FILES['foto'] ?? []);
registrarAuditoria((int) $usuario['id'], 'foto_enviada', ['foto' => $enderecoFoto]);
responderJson(['foto' => $enderecoFoto], 201);
