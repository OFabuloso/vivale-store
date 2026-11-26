<?php
/**
 * GET api/admin/painel.php — tudo o que o painel precisa ao abrir:
 * todos os produtos (inclusive inativos), todos os contatos (inclusive desligados) e o valor mínimo.
 * Para o dono, também as datas dos últimos backups.
 */
declare(strict_types=1);

require __DIR__ . '/../nucleo/inicio.php';
require __DIR__ . '/../nucleo/backup.php';

$usuario = exigirUsuarioLogado();
if (metodoDaRequisicao() !== 'GET') {
    recusarMetodo();
}

$respostaDoPainel = [
    'usuario' => $usuario,
    'produtos' => listarProdutos(false),
    'configuracao' => [
        'contatosWhatsApp' => listarContatos(false),
        'valorMinimo' => obterValorMinimo(),
    ],
];
if ($usuario['papel'] === PAPEL_DONO) {
    $respostaDoPainel['backup'] = obterSituacaoDosBackups();
}
responderJson($respostaDoPainel);
