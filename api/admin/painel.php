<?php
/**
 * GET api/admin/painel.php — tudo o que o painel precisa ao abrir:
 * todos os produtos (inclusive inativos), todos os contatos (inclusive desligados) e o valor mínimo.
 */
declare(strict_types=1);

require __DIR__ . '/../nucleo/inicio.php';

$usuario = exigirUsuarioLogado();
if (metodoDaRequisicao() !== 'GET') {
    recusarMetodo();
}

responderJson([
    'usuario' => $usuario,
    'produtos' => listarProdutos(false),
    'configuracao' => [
        'contatosWhatsApp' => listarContatos(false),
        'valorMinimo' => obterValorMinimo(),
    ],
]);
