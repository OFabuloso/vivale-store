<?php
/**
 * Status de quem está logado no painel.
 *   GET  → { status, statusDesde } (o painel chama de tempos em tempos: é o sinal de que continua aberto)
 *   POST { status: 'online' | 'pausa' | 'ausente' | 'offline' } → troca o próprio status
 */
declare(strict_types=1);

require __DIR__ . '/../nucleo/inicio.php';

$usuario = exigirUsuarioLogado();
$idUsuario = (int) $usuario['id'];

if (metodoDaRequisicao() === 'POST') {
    $dados = lerCorpoJson();
    $status = validarStatus($dados['status'] ?? null);
    $statusAnterior = obterStatus($idUsuario)['status'];
    definirStatus($idUsuario, $status);
    // A troca automática para "ausente" (e a volta) não precisa encher o registro de ações
    if ($status !== $statusAnterior && ($dados['automatico'] ?? false) !== true) {
        registrarAuditoria($idUsuario, 'status_alterado', ['status' => $status]);
    }
} elseif (metodoDaRequisicao() !== 'GET') {
    recusarMetodo();
}

responderJson(obterStatus($idUsuario));
