<?php
/**
 * Pedidos: os que a cliente manda pelo site (ficam pendentes até o atendente marcar "vendido")
 * e as vendas no balcão (já nascem vendidas). Ao virar "vendido", o estoque é baixado.
 * Preço e nome dos itens sempre vêm do banco, nunca do navegador.
 */
declare(strict_types=1);

const ORIGEM_SITE = 'site';
const ORIGEM_BALCAO = 'balcao';
const SITUACAO_PENDENTE = 'pendente';
const SITUACAO_VENDIDO = 'vendido';
const SITUACAO_CANCELADO = 'cancelado';
const FORMAS_DE_PAGAMENTO = ['pix', 'dinheiro', 'credito', 'debito'];
const LIMITE_ITENS_POR_PEDIDO = 100;
const LIMITE_PECAS_POR_ITEM = 10000;
const LIMITE_PEDIDOS_DO_SITE_POR_HORA = 10;
const PEDIDOS_POR_LISTA = 100;

function validarFormaDePagamento(mixed $forma): string
{
    if (!is_string($forma) || !in_array($forma, FORMAS_DE_PAGAMENTO, true)) {
        falhaDeValidacao('Escolha a forma de pagamento.');
    }
    return $forma;
}

/**
 * Confere os itens recebidos e monta as linhas do pedido com nome e preço do banco.
 * Itens repetidos (mesmo produto, tamanho e cor) são somados.
 * No site, só vale produto ativo e variação que não esteja esgotada.
 */
function montarItensDoPedido(mixed $itensRecebidos, bool $somenteDisponiveis): array
{
    if (!is_array($itensRecebidos) || $itensRecebidos === []) {
        falhaDeValidacao('O pedido está vazio.');
    }
    if (count($itensRecebidos) > LIMITE_ITENS_POR_PEDIDO) {
        falhaDeValidacao('Pedido com itens demais.');
    }
    $estoquePorProduto = lerEstoqueDosProdutos();
    $itensPorVariacao = [];
    foreach ($itensRecebidos as $itemRecebido) {
        $idProduto = is_array($itemRecebido) ? ($itemRecebido['idProduto'] ?? '') : '';
        $produto = identificadorEhValido($idProduto) ? buscarProduto($idProduto) : null;
        if ($produto === null || ($somenteDisponiveis && !$produto['ativo'])) {
            throw new ErroDaApi(409, 'Um dos produtos do pedido não está mais disponível. Atualize a página.');
        }
        $tamanho = (string) ($itemRecebido['tamanho'] ?? '');
        $cor = (string) ($itemRecebido['cor'] ?? '');
        $quantidade = $itemRecebido['quantidade'] ?? 0;
        if (!in_array($tamanho, $produto['tamanhos'], true) || !in_array($cor, $produto['cores'], true)) {
            throw new ErroDaApi(409, "O tamanho ou a cor de \"{$produto['nome']}\" não está mais disponível.");
        }
        if (!is_int($quantidade) || $quantidade < 1 || $quantidade > LIMITE_PECAS_POR_ITEM) {
            falhaDeValidacao('Quantidade inválida em um dos itens.');
        }
        $chave = $produto['id'] . "\n" . chaveDaVariacao($tamanho, $cor);
        if ($somenteDisponiveis && $produto['controlaEstoque']
            && (($estoquePorProduto[$produto['id']][chaveDaVariacao($tamanho, $cor)] ?? 0) <= 0)) {
            throw new ErroDaApi(409, "\"{$produto['nome']}\" ({$tamanho}, {$cor}) esgotou. Atualize a página.");
        }
        $itensPorVariacao[$chave] ??= [
            'produto_id' => $produto['id'],
            'nome' => $produto['nome'],
            'tamanho' => $tamanho,
            'cor' => $cor,
            'quantidade' => 0,
            'preco_unitario' => $produto['preco'],
        ];
        $itensPorVariacao[$chave]['quantidade'] += $quantidade;
    }
    return array_values($itensPorVariacao);
}

function calcularTotalDosItens(array $itens): float
{
    return round(array_sum(array_map(fn (array $item): float => $item['quantidade'] * $item['preco_unitario'], $itens)), 2);
}

/** Grava o pedido e os itens. Devolve o número do pedido. Deve rodar dentro de uma transação. */
function gravarPedido(string $origem, array $itens, array $dadosDoPedido): int
{
    executarConsulta(
        'INSERT INTO pedidos (origem, situacao, total, observacoes, contato_nome, ip, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
            $origem,
            SITUACAO_PENDENTE,
            calcularTotalDosItens($itens),
            $dadosDoPedido['observacoes'] ?? null,
            $dadosDoPedido['contatoNome'] ?? null,
            ipDaRequisicao(),
            $dadosDoPedido['idUsuario'] ?? null,
        ],
    );
    $idPedido = (int) conexaoComBanco()->lastInsertId();
    foreach ($itens as $item) {
        executarConsulta(
            'INSERT INTO pedido_itens (pedido_id, produto_id, nome, tamanho, cor, quantidade, preco_unitario) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [$idPedido, $item['produto_id'], $item['nome'], $item['tamanho'], $item['cor'], $item['quantidade'], $item['preco_unitario']],
        );
    }
    return $idPedido;
}

function contarPedidosRecentesDoIp(string $ip): int
{
    return (int) executarConsulta(
        "SELECT COUNT(*) FROM pedidos WHERE origem = 'site' AND ip = ? AND criado_em > (NOW() - INTERVAL 1 HOUR)",
        [$ip],
    )->fetchColumn();
}

/** Pedido no formato do painel, com os itens e o nome de quem vendeu. */
function converterPedido(array $linha, array $itens): array
{
    return [
        'id' => (int) $linha['id'],
        'origem' => $linha['origem'],
        'situacao' => $linha['situacao'],
        'formaPagamento' => $linha['forma_pagamento'],
        'total' => (float) $linha['total'],
        'observacoes' => $linha['observacoes'] ?? '',
        'atendente' => $linha['contato_nome'],
        'criadoPor' => $linha['nome_criador'],
        'finalizadoPor' => $linha['nome_finalizador'],
        'criadoEm' => $linha['criado_em'],
        'finalizadoEm' => $linha['finalizado_em'],
        'itens' => array_map(fn (array $item): array => [
            'idProduto' => $item['produto_id'],
            'nome' => $item['nome'],
            'tamanho' => $item['tamanho'],
            'cor' => $item['cor'],
            'quantidade' => (int) $item['quantidade'],
            'preco' => (float) $item['preco_unitario'],
        ], $itens),
    ];
}

const CONSULTA_DE_PEDIDOS = 'SELECT pedidos.*, criador.nome AS nome_criador, finalizador.nome AS nome_finalizador
    FROM pedidos
    LEFT JOIN usuarios criador ON criador.id = pedidos.criado_por
    LEFT JOIN usuarios finalizador ON finalizador.id = pedidos.finalizado_por';

/** Pedidos de uma situação, os mais novos primeiro. */
function listarPedidos(string $situacao): array
{
    $linhas = executarConsulta(
        CONSULTA_DE_PEDIDOS . ' WHERE pedidos.situacao = ? ORDER BY pedidos.id DESC LIMIT ' . PEDIDOS_POR_LISTA,
        [$situacao],
    )->fetchAll();
    if ($linhas === []) {
        return [];
    }
    $idsDosPedidos = array_map(fn (array $linha): int => (int) $linha['id'], $linhas);
    $marcadores = implode(', ', array_fill(0, count($idsDosPedidos), '?'));
    $itensPorPedido = [];
    foreach (executarConsulta("SELECT * FROM pedido_itens WHERE pedido_id IN ({$marcadores}) ORDER BY id", $idsDosPedidos)->fetchAll() as $item) {
        $itensPorPedido[(int) $item['pedido_id']][] = $item;
    }
    return array_map(fn (array $linha): array => converterPedido($linha, $itensPorPedido[(int) $linha['id']] ?? []), $linhas);
}

function buscarPedido(int $idPedido): ?array
{
    $linha = executarConsulta(CONSULTA_DE_PEDIDOS . ' WHERE pedidos.id = ?', [$idPedido])->fetch();
    if (!$linha) {
        return null;
    }
    $itens = executarConsulta('SELECT * FROM pedido_itens WHERE pedido_id = ? ORDER BY id', [$idPedido])->fetchAll();
    return converterPedido($linha, $itens);
}

function contarPedidosPendentes(): int
{
    return (int) executarConsulta("SELECT COUNT(*) FROM pedidos WHERE situacao = 'pendente'")->fetchColumn();
}

/** Trava o pedido para alterar (duas pessoas não marcam o mesmo pedido ao mesmo tempo). */
function travarPedido(int $idPedido): array
{
    $pedido = executarConsulta('SELECT id, situacao FROM pedidos WHERE id = ? FOR UPDATE', [$idPedido])->fetch();
    if (!$pedido) {
        throw new ErroDaApi(404, 'Pedido não encontrado.');
    }
    return $pedido;
}

/** Pendente → vendido: baixa o estoque e anota a forma de pagamento. Deve rodar dentro de uma transação. */
function venderPedido(int $idPedido, string $formaPagamento, int $idUsuario): void
{
    $pedido = travarPedido($idPedido);
    if ($pedido['situacao'] !== SITUACAO_PENDENTE) {
        throw new ErroDaApi(409, "O pedido nº {$idPedido} não está mais pendente.");
    }
    $itens = executarConsulta('SELECT * FROM pedido_itens WHERE pedido_id = ?', [$idPedido])->fetchAll();
    baixarEstoqueDoPedido($idPedido, $itens, $idUsuario);
    executarConsulta(
        'UPDATE pedidos SET situacao = ?, forma_pagamento = ?, finalizado_por = ?, finalizado_em = NOW() WHERE id = ?',
        [SITUACAO_VENDIDO, $formaPagamento, $idUsuario, $idPedido],
    );
}

/**
 * Cancela um pedido. O pendente qualquer pessoa da equipe cancela; o vendido só o dono, e as
 * peças voltam para o estoque. Deve rodar dentro de uma transação.
 */
function cancelarPedido(int $idPedido, array $usuario): void
{
    $pedido = travarPedido($idPedido);
    if ($pedido['situacao'] === SITUACAO_CANCELADO) {
        throw new ErroDaApi(409, "O pedido nº {$idPedido} já está cancelado.");
    }
    if ($pedido['situacao'] === SITUACAO_VENDIDO) {
        if ($usuario['papel'] !== PAPEL_DONO) {
            throw new ErroDaApi(403, 'Só o dono da loja pode cancelar uma venda já concluída.');
        }
        devolverEstoqueDoPedido($idPedido, (int) $usuario['id']);
    }
    executarConsulta(
        'UPDATE pedidos SET situacao = ?, finalizado_por = ?, finalizado_em = NOW() WHERE id = ?',
        [SITUACAO_CANCELADO, $usuario['id'], $idPedido],
    );
}
