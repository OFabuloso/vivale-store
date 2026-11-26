<?php
/**
 * POST api/pedidos.php — a cliente finaliza o pedido pelo site (sem login), logo antes de abrir
 * o WhatsApp. Corpo: { itens: [{ idProduto, tamanho, cor, quantidade }], observacoes, idContato }.
 * Responde { numero } para ir na mensagem. O pedido fica pendente até o atendente marcar "vendido".
 *
 * Proteções sem login: só aceita JSON do próprio site (outro site não consegue enviar JSON sem
 * passar pela checagem de CORS do navegador), limite de pedidos por hora por endereço e preços
 * sempre recalculados no servidor.
 */
declare(strict_types=1);

require __DIR__ . '/nucleo/inicio.php';
require __DIR__ . '/nucleo/pedidos.php';

if (metodoDaRequisicao() !== 'POST') {
    recusarMetodo();
}
if (!str_starts_with(strtolower($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) {
    throw new ErroDaApi(415, 'Envie os dados em JSON.');
}
$origem = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origem !== '' && !origemEhDoProprioSite($origem)) {
    throw new ErroDaApi(403, 'Requisição de origem não permitida.');
}
if (contarPedidosRecentesDoIp(ipDaRequisicao()) >= LIMITE_PEDIDOS_DO_SITE_POR_HORA) {
    throw new ErroDaApi(429, 'Muitos pedidos em pouco tempo. Fale direto com a loja pelo WhatsApp.');
}

$dados = lerCorpoJson();
$itens = montarItensDoPedido($dados['itens'] ?? null, true);

$valorMinimo = obterValorMinimo();
if (calcularTotalDosItens($itens) < $valorMinimo) {
    throw new ErroDaApi(422, 'O pedido ainda não chegou ao valor mínimo do atacado.');
}
$contato = null;
foreach (listarContatos(true) as $contatoLigado) {
    if ($contatoLigado['id'] === ($dados['idContato'] ?? null)) {
        $contato = $contatoLigado;
    }
}
if ($contato === null) {
    throw new ErroDaApi(409, 'Esse atendimento não está mais disponível.');
}

$numeroDoPedido = emTransacao(fn (): int => gravarPedido(ORIGEM_SITE, $itens, [
    'observacoes' => textoLimpo($dados['observacoes'] ?? '', 1000) ?: null,
    'contatoNome' => $contato['nome'],
]));
responderJson(['numero' => $numeroDoPedido], 201);
