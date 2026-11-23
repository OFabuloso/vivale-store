<?php
/**
 * Produtos do catálogo (precisa de login).
 *   POST   → cria ou atualiza; corpo com os campos do produto (sem "id" = produto novo)
 *   DELETE → api/admin/produtos.php?id=prd-... (só o dono; o funcionário pode inativar)
 */
declare(strict_types=1);

require __DIR__ . '/../nucleo/inicio.php';

$usuario = exigirUsuarioLogado();

switch (metodoDaRequisicao()) {
    case 'POST':
        $dados = lerCorpoJson();
        $idProduto = $dados['id'] ?? null;
        if ($idProduto !== null && !identificadorEhValido($idProduto)) {
            throw new ErroDaApi(422, 'Identificador de produto inválido.');
        }
        $produtoSalvo = salvarProdutoNoBanco($idProduto, validarProduto($dados));
        registrarAuditoria((int) $usuario['id'], 'produto_salvo', ['id' => $produtoSalvo['id'], 'nome' => $produtoSalvo['nome']]);
        responderJson(['produto' => $produtoSalvo]);

    case 'DELETE':
        if ($usuario['papel'] !== PAPEL_DONO) {
            throw new ErroDaApi(403, 'Só o dono da loja pode excluir produtos. Você pode inativar o produto.');
        }
        $idProduto = $_GET['id'] ?? '';
        if (!identificadorEhValido($idProduto)) {
            throw new ErroDaApi(422, 'Identificador de produto inválido.');
        }
        $produto = buscarProduto($idProduto);
        if ($produto === null || !removerProdutoDoBanco($idProduto)) {
            throw new ErroDaApi(404, 'Produto não encontrado.');
        }
        registrarAuditoria((int) $usuario['id'], 'produto_excluido', ['id' => $idProduto, 'nome' => $produto['nome']]);
        responderJson(['excluido' => $idProduto]);

    default:
        recusarMetodo();
}
