<?php
/**
 * GET api/admin/painel.php — tudo o que o painel precisa ao abrir:
 * todos os produtos (inclusive inativos), todos os contatos (inclusive desligados) e o valor mínimo.
 * Também traz a grade de estoque de cada produto e as variações no mínimo (alertasEstoque),
 * se a própria pessoa usa 2FA e, para o dono, as datas dos últimos backups.
 */
declare(strict_types=1);

require __DIR__ . '/../nucleo/inicio.php';
require __DIR__ . '/../nucleo/backup.php';

$usuario = exigirUsuarioLogado();
if (metodoDaRequisicao() !== 'GET') {
    recusarMetodo();
}

$produtos = listarProdutosComEstoque(false);
$respostaDoPainel = [
    'usuario' => $usuario + ['doisFatores' => obterDoisFatoresDoUsuario((int) $usuario['id']) !== null] + obterStatus((int) $usuario['id']),
    'produtos' => $produtos,
    'alertasEstoque' => listarAlertasDeEstoque($produtos),
    'configuracao' => [
        'contatosWhatsApp' => listarContatos(false),
        'valorMinimo' => obterValorMinimo(),
    ],
];
if ($usuario['papel'] === PAPEL_DONO) {
    $respostaDoPainel['backup'] = obterSituacaoDosBackups();
}
responderJson($respostaDoPainel);
