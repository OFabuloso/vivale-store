<?php
/**
 * PUT api/admin/configuracao.php — salva o valor mínimo do pedido. Corpo: { valorMinimo }.
 * Só o dono.
 */
declare(strict_types=1);

require __DIR__ . '/../nucleo/inicio.php';

$usuario = exigirDono();
if (metodoDaRequisicao() !== 'PUT') {
    recusarMetodo();
}

$valorMinimo = validarValorMinimo(lerCorpoJson()['valorMinimo'] ?? null);
salvarValorMinimo($valorMinimo);
registrarAuditoria((int) $usuario['id'], 'configuracao_salva', ['valorMinimo' => $valorMinimo]);
responderJson(['valorMinimo' => obterValorMinimo()]);
