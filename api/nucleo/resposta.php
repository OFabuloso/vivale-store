<?php
/**
 * Respostas em JSON e tratamento de erros comuns a todos os endpoints.
 */
declare(strict_types=1);

/** Erro esperado (dado inválido, sem permissão...): a mensagem pode ser mostrada à pessoa. */
final class ErroDaApi extends RuntimeException
{
    public function __construct(public readonly int $codigoHttp, string $mensagem)
    {
        parent::__construct($mensagem);
    }
}

function responderJson(array $dados, int $codigoHttp = 200): never
{
    http_response_code($codigoHttp);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function responderErro(int $codigoHttp, string $mensagem): never
{
    responderJson(['erro' => $mensagem], $codigoHttp);
}

/** Erros esperados viram JSON com a mensagem; os inesperados só vão para o log do servidor. */
function tratarExcecao(Throwable $excecao): never
{
    if ($excecao instanceof ErroDaApi) {
        responderErro($excecao->codigoHttp, $excecao->getMessage());
    }
    error_log('[vivale-api] ' . $excecao);
    responderErro(500, 'Erro interno no servidor. Tente novamente em instantes.');
}

set_exception_handler('tratarExcecao');

function metodoDaRequisicao(): string
{
    return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
}

/** Lê o corpo JSON da requisição (até 1 MB) e devolve um array. */
function lerCorpoJson(): array
{
    $corpo = file_get_contents('php://input', false, null, 0, 1024 * 1024 + 1);
    if ($corpo === false || strlen($corpo) > 1024 * 1024) {
        throw new ErroDaApi(413, 'Dados grandes demais.');
    }
    $dados = json_decode($corpo === '' ? '{}' : $corpo, true);
    if (!is_array($dados)) {
        throw new ErroDaApi(400, 'Dados em formato inválido.');
    }
    return $dados;
}

function recusarMetodo(): never
{
    responderErro(405, 'Método não permitido.');
}

/** Endereço IP de quem fez a requisição (usado no limite de tentativas e na auditoria). */
function ipDaRequisicao(): string
{
    return substr((string) ($_SERVER['REMOTE_ADDR'] ?? 'desconhecido'), 0, 45);
}
