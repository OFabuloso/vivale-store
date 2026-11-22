<?php
/**
 * Leitura e gravação do catálogo no banco: produtos, contatos e configurações.
 * Os formatos devolvidos são os mesmos que o navegador já usa (js/dados/dados-iniciais.js).
 */
declare(strict_types=1);

const VALOR_MINIMO_PADRAO = 500.0;

function converterLinhaDeProduto(array $linha): array
{
    return [
        'id' => $linha['id'],
        'nome' => $linha['nome'],
        'descricao' => $linha['descricao'],
        'categoria' => $linha['categoria'],
        'preco' => (float) $linha['preco'],
        'foto' => $linha['foto'],
        'tamanhos' => json_decode($linha['tamanhos'], true) ?: [],
        'cores' => json_decode($linha['cores'], true) ?: [],
        'ativo' => (bool) $linha['ativo'],
    ];
}

function listarProdutos(bool $somenteAtivos): array
{
    $filtro = $somenteAtivos ? 'WHERE ativo = 1' : '';
    $linhas = executarConsulta("SELECT * FROM produtos {$filtro} ORDER BY ordem, criado_em")->fetchAll();
    return array_map('converterLinhaDeProduto', $linhas);
}

function buscarProduto(string $idProduto): ?array
{
    $linha = executarConsulta('SELECT * FROM produtos WHERE id = ?', [$idProduto])->fetch();
    return $linha ? converterLinhaDeProduto($linha) : null;
}

/** Atualiza o produto se o id já existir; senão cria um novo no topo da lista. */
function salvarProdutoNoBanco(?string $idProduto, array $produto): array
{
    $valores = [
        $produto['nome'],
        $produto['descricao'],
        $produto['categoria'],
        $produto['preco'],
        $produto['foto'],
        json_encode($produto['tamanhos'], JSON_UNESCAPED_UNICODE),
        json_encode($produto['cores'], JSON_UNESCAPED_UNICODE),
        $produto['ativo'] ? 1 : 0,
    ];

    if ($idProduto !== null && buscarProduto($idProduto) !== null) {
        executarConsulta(
            'UPDATE produtos SET nome = ?, descricao = ?, categoria = ?, preco = ?, foto = ?,
             tamanhos = ?, cores = ?, ativo = ? WHERE id = ?',
            [...$valores, $idProduto],
        );
    } else {
        $idProduto = $idProduto ?? gerarIdentificador('prd');
        $menorOrdem = (int) executarConsulta('SELECT COALESCE(MIN(ordem), 0) FROM produtos')->fetchColumn();
        executarConsulta(
            'INSERT INTO produtos (nome, descricao, categoria, preco, foto, tamanhos, cores, ativo, id, ordem)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [...$valores, $idProduto, $menorOrdem - 1],
        );
    }
    return buscarProduto($idProduto);
}

function removerProdutoDoBanco(string $idProduto): bool
{
    return executarConsulta('DELETE FROM produtos WHERE id = ?', [$idProduto])->rowCount() > 0;
}

function listarContatos(bool $somenteLigados): array
{
    $filtro = $somenteLigados ? 'WHERE ativo = 1' : '';
    $linhas = executarConsulta("SELECT id, nome, numero, ativo FROM contatos {$filtro} ORDER BY ordem")->fetchAll();
    return array_map(
        fn (array $linha): array => [...$linha, 'ativo' => (bool) $linha['ativo']],
        $linhas,
    );
}

/** Troca a lista inteira de contatos pela lista validada, na mesma ordem. */
function substituirContatos(array $contatosValidados): void
{
    emTransacao(function () use ($contatosValidados): void {
        executarConsulta('DELETE FROM contatos');
        foreach ($contatosValidados as $posicao => $contato) {
            executarConsulta(
                'INSERT INTO contatos (id, nome, numero, ativo, ordem) VALUES (?, ?, ?, ?, ?)',
                [$contato['id'], $contato['nome'], $contato['numero'], $contato['ativo'] ? 1 : 0, $posicao],
            );
        }
    });
}

function obterValorMinimo(): float
{
    $valor = executarConsulta("SELECT valor FROM configuracoes WHERE chave = 'valorMinimo'")->fetchColumn();
    return $valor === false ? VALOR_MINIMO_PADRAO : (float) json_decode($valor);
}

function salvarValorMinimo(float $valorMinimo): void
{
    executarConsulta(
        "INSERT INTO configuracoes (chave, valor) VALUES ('valorMinimo', ?)
         ON DUPLICATE KEY UPDATE valor = VALUES(valor)",
        [json_encode($valorMinimo)],
    );
}

/** O que a cliente pode ver: produtos ativos, contatos ligados e o pedido mínimo. */
function montarCatalogoPublico(): array
{
    return [
        'produtos' => listarProdutos(true),
        'configuracao' => [
            'contatosWhatsApp' => listarContatos(true),
            'valorMinimo' => obterValorMinimo(),
        ],
    ];
}
