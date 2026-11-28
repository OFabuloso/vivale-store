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
        // Como objeto, para o navegador receber {} e não [] quando estiver vazio
        'fotosPorCor' => (object) lerFotosPorCor($linha['fotos_por_cor'] ?? null),
        'tamanhos' => json_decode($linha['tamanhos'], true) ?: [],
        'cores' => json_decode($linha['cores'], true) ?: [],
        'ativo' => (bool) $linha['ativo'],
        'controlaEstoque' => (bool) $linha['controla_estoque'],
        'alertaEstoque' => (int) $linha['alerta_estoque'],
    ];
}

/** Foto de cada cor (["Pink" => "fotos/...jpg"]); vazio quando todas as cores usam a foto principal. */
function lerFotosPorCor(?string $json): array
{
    $fotosPorCor = $json === null ? [] : json_decode($json, true);
    return is_array($fotosPorCor) ? $fotosPorCor : [];
}

/** Produtos com a grade de estoque de cada um ("estoque": [chave => quantidade]). */
function listarProdutosComEstoque(bool $somenteAtivos): array
{
    $estoquePorProduto = lerEstoqueDosProdutos();
    return array_map(
        fn (array $produto): array => $produto + ['estoque' => montarGradeDeEstoque($produto, $estoquePorProduto[$produto['id']] ?? [])],
        listarProdutos($somenteAtivos),
    );
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
        // Como objeto, para o navegador receber {} e não [] quando não houver fotos por cor
        json_encode((object) $produto['fotosPorCor'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        json_encode($produto['tamanhos'], JSON_UNESCAPED_UNICODE),
        json_encode($produto['cores'], JSON_UNESCAPED_UNICODE),
        $produto['ativo'] ? 1 : 0,
        $produto['controlaEstoque'] ? 1 : 0,
        $produto['alertaEstoque'],
    ];

    if ($idProduto !== null && buscarProduto($idProduto) !== null) {
        executarConsulta(
            'UPDATE produtos SET nome = ?, descricao = ?, categoria = ?, preco = ?, foto = ?, fotos_por_cor = ?,
             tamanhos = ?, cores = ?, ativo = ?, controla_estoque = ?, alerta_estoque = ? WHERE id = ?',
            [...$valores, $idProduto],
        );
    } else {
        $idProduto = $idProduto ?? gerarIdentificador('prd');
        $menorOrdem = (int) executarConsulta('SELECT COALESCE(MIN(ordem), 0) FROM produtos')->fetchColumn();
        executarConsulta(
            'INSERT INTO produtos (nome, descricao, categoria, preco, foto, fotos_por_cor, tamanhos, cores, ativo, controla_estoque, alerta_estoque, id, ordem)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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

/**
 * Produto como a cliente vê: sem quantidades nem o limite de aviso, só a lista de variações
 * esgotadas ("M|Azul") dos produtos com controle de estoque.
 */
function montarProdutoPublico(array $produto): array
{
    $esgotados = $produto['controlaEstoque'] ? listarVariacoesEsgotadas($produto['estoque']) : [];
    unset($produto['controlaEstoque'], $produto['alertaEstoque'], $produto['estoque']);
    return $produto + ['esgotados' => $esgotados];
}

/** O que a cliente pode ver: produtos ativos, contatos ligados e o pedido mínimo. */
function montarCatalogoPublico(): array
{
    return [
        'produtos' => array_map('montarProdutoPublico', listarProdutosComEstoque(true)),
        'configuracao' => [
            'contatosWhatsApp' => listarContatos(true),
            'valorMinimo' => obterValorMinimo(),
        ],
    ];
}
