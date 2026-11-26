<?php
/**
 * Vendas do painel (precisa de login).
 *   GET  ?situacao=pendente|vendido|cancelado → { pedidos, pendentes }
 *   POST { acao: 'vender', id, formaPagamento }             → pedido do site vira venda (baixa o estoque)
 *   POST { acao: 'cancelar', id }                           → cancela (venda concluída: só o dono, devolve o estoque)
 *   POST { acao: 'balcao', itens, formaPagamento, observacoes } → venda na loja física, já concluída
 * As respostas de POST trazem o pedido completo, pronto para imprimir o comprovante.
 */
declare(strict_types=1);

require __DIR__ . '/../nucleo/inicio.php';
require __DIR__ . '/../nucleo/pedidos.php';

$usuario = exigirUsuarioLogado();
$idUsuario = (int) $usuario['id'];

if (metodoDaRequisicao() === 'GET') {
    $situacao = $_GET['situacao'] ?? SITUACAO_PENDENTE;
    if (!in_array($situacao, [SITUACAO_PENDENTE, SITUACAO_VENDIDO, SITUACAO_CANCELADO], true)) {
        throw new ErroDaApi(422, 'Situação inválida.');
    }
    responderJson(['pedidos' => listarPedidos($situacao), 'pendentes' => contarPedidosPendentes()]);
}
if (metodoDaRequisicao() !== 'POST') {
    recusarMetodo();
}

$dados = lerCorpoJson();
$idPedido = is_int($dados['id'] ?? null) ? $dados['id'] : 0;

switch ($dados['acao'] ?? '') {
    case 'vender':
        $formaPagamento = validarFormaDePagamento($dados['formaPagamento'] ?? null);
        emTransacao(fn () => venderPedido($idPedido, $formaPagamento, $idUsuario));
        registrarAuditoria($idUsuario, 'pedido_vendido', ['pedido' => $idPedido, 'forma' => $formaPagamento]);
        break;

    case 'cancelar':
        emTransacao(fn () => cancelarPedido($idPedido, $usuario));
        registrarAuditoria($idUsuario, 'pedido_cancelado', ['pedido' => $idPedido]);
        break;

    case 'balcao':
        $formaPagamento = validarFormaDePagamento($dados['formaPagamento'] ?? null);
        // No balcão vale qualquer produto cadastrado (até inativo na loja); o estoque é conferido ao vender
        $itens = montarItensDoPedido($dados['itens'] ?? null, false);
        $idPedido = emTransacao(function () use ($itens, $dados, $formaPagamento, $idUsuario): int {
            $idNovoPedido = gravarPedido(ORIGEM_BALCAO, $itens, [
                'observacoes' => textoLimpo($dados['observacoes'] ?? '', 1000) ?: null,
                'idUsuario' => $idUsuario,
            ]);
            venderPedido($idNovoPedido, $formaPagamento, $idUsuario);
            return $idNovoPedido;
        });
        registrarAuditoria($idUsuario, 'venda_balcao', ['pedido' => $idPedido, 'forma' => $formaPagamento]);
        break;

    default:
        throw new ErroDaApi(422, 'Ação desconhecida.');
}

responderJson(['pedido' => buscarPedido($idPedido), 'pendentes' => contarPedidosPendentes()]);
