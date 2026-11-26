<?php
/**
 * Estoque por variação (tamanho + cor) dos produtos com o controle ligado.
 * Toda mudança de quantidade gera uma linha em movimentos_estoque (ajuste, venda ou cancelamento).
 * No navegador, cada variação é identificada pela chave "TAMANHO|Cor" (ex.: "M|Azul Bebê").
 */
declare(strict_types=1);

const QUANTIDADE_MAXIMA_EM_ESTOQUE = 100000;
const MOTIVO_AJUSTE = 'ajuste';
const MOTIVO_VENDA = 'venda';
const MOTIVO_CANCELAMENTO = 'cancelamento';

function chaveDaVariacao(string $tamanho, string $cor): string
{
    return $tamanho . '|' . $cor;
}

/** Todas as variações que o produto oferece hoje, como chaves. */
function listarChavesDoProduto(array $produto): array
{
    $chaves = [];
    foreach ($produto['tamanhos'] as $tamanho) {
        foreach ($produto['cores'] as $cor) {
            $chaves[] = chaveDaVariacao($tamanho, $cor);
        }
    }
    return $chaves;
}

/** Quantidades guardadas, por produto: [idProduto => [chave => quantidade]]. */
function lerEstoqueDosProdutos(): array
{
    $estoquePorProduto = [];
    foreach (executarConsulta('SELECT produto_id, tamanho, cor, quantidade FROM estoque')->fetchAll() as $linha) {
        $estoquePorProduto[$linha['produto_id']][chaveDaVariacao($linha['tamanho'], $linha['cor'])] = (int) $linha['quantidade'];
    }
    return $estoquePorProduto;
}

/** Grade completa do produto (variação sem linha no banco conta como zero). */
function montarGradeDeEstoque(array $produto, array $quantidadesGuardadas): array
{
    $grade = [];
    foreach (listarChavesDoProduto($produto) as $chave) {
        $grade[$chave] = $quantidadesGuardadas[$chave] ?? 0;
    }
    return $grade;
}

/** Confere as quantidades enviadas pelo painel: número inteiro de 0 a 100.000 em cada variação. */
function validarGradeDeEstoque(array $produto, mixed $quantidadesRecebidas): array
{
    $quantidades = is_array($quantidadesRecebidas) ? $quantidadesRecebidas : [];
    $grade = [];
    foreach (listarChavesDoProduto($produto) as $chave) {
        $valor = $quantidades[$chave] ?? 0;
        if (!is_numeric($valor) || (int) $valor != $valor || $valor < 0 || $valor > QUANTIDADE_MAXIMA_EM_ESTOQUE) {
            falhaDeValidacao('Informe a quantidade em estoque de cada tamanho e cor (número inteiro, a partir de 0).');
        }
        $grade[$chave] = (int) $valor;
    }
    return $grade;
}

function registrarMovimento(string $idProduto, string $tamanho, string $cor, int $variacao, int $quantidadeFinal, string $motivo, ?int $idPedido, ?int $idUsuario): void
{
    executarConsulta(
        'INSERT INTO movimentos_estoque (produto_id, tamanho, cor, variacao, quantidade_final, motivo, pedido_id, usuario_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [$idProduto, $tamanho, $cor, $variacao, $quantidadeFinal, $motivo, $idPedido, $idUsuario],
    );
}

/**
 * Grava a grade que o painel mandou. $gradeVista é o que o painel mostrava quando a pessoa abriu
 * o formulário: só as variações que ela mudou são gravadas, e se alguma delas mudou no banco
 * nesse meio-tempo (uma venda, por exemplo) nada é gravado e a resposta (409) avisa.
 * Variações que o produto não oferece mais (tamanho ou cor retirados) saem da tabela.
 * Deve rodar dentro de uma transação.
 */
function salvarGradeDeEstoque(string $idProduto, array $grade, array $gradeVista, int $idUsuario): void
{
    $atuais = [];
    $linhas = executarConsulta('SELECT tamanho, cor, quantidade FROM estoque WHERE produto_id = ? FOR UPDATE', [$idProduto])->fetchAll();
    foreach ($linhas as $linha) {
        $atuais[chaveDaVariacao($linha['tamanho'], $linha['cor'])] = (int) $linha['quantidade'];
    }

    $mudancasEmOutroLugar = [];
    foreach ($grade as $chave => $quantidadeNova) {
        $quantidadeVista = $gradeVista[$chave] ?? 0;
        $quantidadeAnterior = $atuais[$chave] ?? 0;
        if ($quantidadeNova !== $quantidadeVista && $quantidadeAnterior !== $quantidadeVista) {
            [$tamanho, $cor] = explode('|', $chave, 2);
            $mudancasEmOutroLugar[] = "{$tamanho} {$cor} (agora {$quantidadeAnterior})";
        }
    }
    if ($mudancasEmOutroLugar !== []) {
        throw new ErroDaApi(409, 'O estoque mudou enquanto você editava: ' . implode(', ', $mudancasEmOutroLugar)
            . '. Feche, abra o produto de novo e confira as quantidades.');
    }

    foreach ($grade as $chave => $quantidadeNova) {
        if ($quantidadeNova === ($gradeVista[$chave] ?? 0) && array_key_exists($chave, $atuais)) {
            continue; // Não mexida no formulário: fica como está no banco
        }
        [$tamanho, $cor] = explode('|', $chave, 2);
        $quantidadeAnterior = $atuais[$chave] ?? 0;
        executarConsulta(
            'INSERT INTO estoque (produto_id, tamanho, cor, quantidade) VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE quantidade = VALUES(quantidade)',
            [$idProduto, $tamanho, $cor, $quantidadeNova],
        );
        if ($quantidadeNova !== $quantidadeAnterior) {
            registrarMovimento($idProduto, $tamanho, $cor, $quantidadeNova - $quantidadeAnterior, $quantidadeNova, MOTIVO_AJUSTE, null, $idUsuario);
        }
    }
    foreach (array_diff_key($atuais, $grade) as $chaveRetirada => $quantidade) {
        [$tamanho, $cor] = explode('|', $chaveRetirada, 2);
        executarConsulta('DELETE FROM estoque WHERE produto_id = ? AND tamanho = ? AND cor = ?', [$idProduto, $tamanho, $cor]);
    }
}

/** Variações com quantidade zero (ou menos): a loja mostra "Esgotado" nelas. */
function listarVariacoesEsgotadas(array $grade): array
{
    return array_keys(array_filter($grade, fn (int $quantidade): bool => $quantidade <= 0));
}

/** Variações de produtos ativos no mínimo ou abaixo dele (o ícone de estoque do painel). */
function listarAlertasDeEstoque(array $produtosComEstoque): array
{
    $alertas = [];
    foreach ($produtosComEstoque as $produto) {
        if (!$produto['controlaEstoque'] || !$produto['ativo']) {
            continue;
        }
        foreach ($produto['estoque'] as $chave => $quantidade) {
            if ($quantidade <= $produto['alertaEstoque']) {
                [$tamanho, $cor] = explode('|', $chave, 2);
                $alertas[] = [
                    'idProduto' => $produto['id'],
                    'nome' => $produto['nome'],
                    'tamanho' => $tamanho,
                    'cor' => $cor,
                    'quantidade' => $quantidade,
                    'alerta' => $produto['alertaEstoque'],
                ];
            }
        }
    }
    // Esgotados primeiro, depois os que têm menos peças
    usort($alertas, fn (array $primeiro, array $segundo): int => $primeiro['quantidade'] <=> $segundo['quantidade']);
    return $alertas;
}

/**
 * Tira do estoque as peças de um pedido vendido. Confere tudo antes de baixar: se faltar
 * alguma peça, nada é baixado e a resposta (409) diz o que falta. Produtos sem controle de
 * estoque não são baixados. Deve rodar dentro de uma transação.
 */
function baixarEstoqueDoPedido(int $idPedido, array $itens, int $idUsuario): void
{
    $pecasPorVariacao = [];
    foreach ($itens as $item) {
        $chave = $item['produto_id'] . "\n" . chaveDaVariacao($item['tamanho'], $item['cor']);
        $pecasPorVariacao[$chave] ??= ['item' => $item, 'quantidade' => 0];
        $pecasPorVariacao[$chave]['quantidade'] += (int) $item['quantidade'];
    }

    $baixas = [];
    $faltas = [];
    foreach ($pecasPorVariacao as ['item' => $item, 'quantidade' => $pecasVendidas]) {
        $controlaEstoque = executarConsulta(
            'SELECT controla_estoque FROM produtos WHERE id = ?',
            [$item['produto_id']],
        )->fetchColumn();
        if ((int) $controlaEstoque !== 1) {
            continue;
        }
        $quantidadeAtual = executarConsulta(
            'SELECT quantidade FROM estoque WHERE produto_id = ? AND tamanho = ? AND cor = ? FOR UPDATE',
            [$item['produto_id'], $item['tamanho'], $item['cor']],
        )->fetchColumn();
        $quantidadeAtual = $quantidadeAtual === false ? 0 : (int) $quantidadeAtual;
        if ($quantidadeAtual < $pecasVendidas) {
            $faltas[] = sprintf(
                '%s (%s, %s): pedido %d, em estoque %d',
                $item['nome'],
                $item['tamanho'] === TAMANHO_UNICO ? 'tamanho único' : $item['tamanho'],
                $item['cor'],
                $pecasVendidas,
                max(0, $quantidadeAtual),
            );
            continue;
        }
        $baixas[] = [$item, $pecasVendidas, $quantidadeAtual - $pecasVendidas];
    }

    if ($faltas !== []) {
        throw new ErroDaApi(409, 'Falta peça no estoque: ' . implode('; ', $faltas) . '.');
    }
    foreach ($baixas as [$item, $pecasVendidas, $quantidadeFinal]) {
        executarConsulta(
            'UPDATE estoque SET quantidade = ? WHERE produto_id = ? AND tamanho = ? AND cor = ?',
            [$quantidadeFinal, $item['produto_id'], $item['tamanho'], $item['cor']],
        );
        registrarMovimento($item['produto_id'], $item['tamanho'], $item['cor'], -$pecasVendidas, $quantidadeFinal, MOTIVO_VENDA, $idPedido, $idUsuario);
    }
}

/**
 * Devolve ao estoque exatamente o que a venda tirou (pelo histórico de movimentos), mesmo que
 * o controle do produto tenha sido desligado depois. Deve rodar dentro de uma transação.
 */
function devolverEstoqueDoPedido(int $idPedido, int $idUsuario): void
{
    $baixas = executarConsulta(
        "SELECT produto_id, tamanho, cor, SUM(variacao) AS variacao FROM movimentos_estoque
         WHERE pedido_id = ? AND motivo IN ('venda', 'cancelamento') GROUP BY produto_id, tamanho, cor",
        [$idPedido],
    )->fetchAll();
    foreach ($baixas as $baixa) {
        $pecasADevolver = -(int) $baixa['variacao'];
        if ($pecasADevolver <= 0) {
            continue;
        }
        $quantidadeAtual = executarConsulta(
            'SELECT quantidade FROM estoque WHERE produto_id = ? AND tamanho = ? AND cor = ? FOR UPDATE',
            [$baixa['produto_id'], $baixa['tamanho'], $baixa['cor']],
        )->fetchColumn();
        if ($quantidadeAtual === false) {
            // Variação retirada do produto depois da venda: não há onde devolver
            continue;
        }
        $quantidadeFinal = (int) $quantidadeAtual + $pecasADevolver;
        executarConsulta(
            'UPDATE estoque SET quantidade = ? WHERE produto_id = ? AND tamanho = ? AND cor = ?',
            [$quantidadeFinal, $baixa['produto_id'], $baixa['tamanho'], $baixa['cor']],
        );
        registrarMovimento($baixa['produto_id'], $baixa['tamanho'], $baixa['cor'], $pecasADevolver, $quantidadeFinal, MOTIVO_CANCELAMENTO, $idPedido, $idUsuario);
    }
}
