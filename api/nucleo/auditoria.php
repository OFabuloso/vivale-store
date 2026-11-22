<?php
/**
 * Registro de quem fez o quê no painel (tabela "auditoria").
 */
declare(strict_types=1);

function registrarAuditoria(?int $idUsuario, string $acao, array $detalhes = []): void
{
    executarConsulta(
        'INSERT INTO auditoria (usuario_id, acao, detalhes, ip) VALUES (?, ?, ?, ?)',
        [$idUsuario, $acao, json_encode($detalhes, JSON_UNESCAPED_UNICODE), ipDaRequisicao()],
    );
}
