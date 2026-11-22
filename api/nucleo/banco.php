<?php
/**
 * Conexão única com o MySQL/MariaDB via PDO, sempre com consultas preparadas.
 */
declare(strict_types=1);

function conexaoComBanco(): PDO
{
    static $conexao = null;
    if ($conexao === null) {
        $dadosBanco = obterConfiguracao()['banco'];
        $endereco = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $dadosBanco['servidor'], $dadosBanco['nome']);
        $conexao = new PDO($endereco, $dadosBanco['usuario'], $dadosBanco['senha'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    }
    return $conexao;
}

/** Executa uma consulta preparada e devolve o comando já executado. */
function executarConsulta(string $sql, array $parametros = []): PDOStatement
{
    $comando = conexaoComBanco()->prepare($sql);
    $comando->execute($parametros);
    return $comando;
}

/** Roda as operações numa transação: ou tudo é salvo, ou nada. */
function emTransacao(callable $operacoes): mixed
{
    $conexao = conexaoComBanco();
    $conexao->beginTransaction();
    try {
        $resultado = $operacoes();
        $conexao->commit();
        return $resultado;
    } catch (Throwable $erro) {
        $conexao->rollBack();
        throw $erro;
    }
}
