<?php
/**
 * Produtos do catálogo (precisa de login).
 *   POST   → cria ou atualiza; corpo com os campos do produto (sem "id" = produto novo).
 *            Com controlaEstoque, "estoque" traz a quantidade de cada variação ({ "M|Azul": 12 }) e
 *            "estoqueVisto" o que o formulário mostrava ao abrir (evita gravar por cima de uma venda).
 *            Sem "estoque" (ex.: só inativar), as quantidades não mudam.
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
        $produtoValidado = validarProduto($dados);
        $grade = null;
        $gradeVista = [];
        if ($produtoValidado['controlaEstoque'] && array_key_exists('estoque', $dados)) {
            $grade = validarGradeDeEstoque($produtoValidado, $dados['estoque']);
            $gradeVista = validarGradeDeEstoque($produtoValidado, $dados['estoqueVisto'] ?? []);
        }
        $produtoSalvo = emTransacao(function () use ($idProduto, $produtoValidado, $grade, $gradeVista, $usuario): array {
            $produtoSalvo = salvarProdutoNoBanco($idProduto, $produtoValidado);
            if ($grade !== null) {
                salvarGradeDeEstoque($produtoSalvo['id'], $grade, $gradeVista, (int) $usuario['id']);
            }
            return $produtoSalvo;
        });
        registrarAuditoria((int) $usuario['id'], 'produto_salvo', ['id' => $produtoSalvo['id'], 'nome' => $produtoSalvo['nome']]);
        $estoqueGuardado = lerEstoqueDosProdutos()[$produtoSalvo['id']] ?? [];
        responderJson(['produto' => $produtoSalvo + ['estoque' => montarGradeDeEstoque($produtoSalvo, $estoqueGuardado)]]);

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
