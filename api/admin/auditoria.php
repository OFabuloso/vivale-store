<?php
/**
 * GET api/admin/auditoria.php — registro de ações do painel (só o dono), do mais novo ao mais antigo.
 *   ?antesDe=<id>          → continua a lista a partir daquele registro ("Carregar mais")
 *   ?usuario=<id>          → só as ações de uma pessoa
 *   ?acoes=login,logout    → só esses tipos de ação (os grupos ficam em js/logica/registro.js)
 * Responde { registros, temMais }.
 */
declare(strict_types=1);

require __DIR__ . '/../nucleo/inicio.php';

const REGISTROS_POR_PAGINA = 50;

exigirDono();
if (metodoDaRequisicao() !== 'GET') {
    recusarMetodo();
}

$condicoes = [];
$parametros = [];
$antesDe = filter_var($_GET['antesDe'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
if ($antesDe !== false && $antesDe !== null) {
    $condicoes[] = 'auditoria.id < ?';
    $parametros[] = $antesDe;
}
$idUsuario = filter_var($_GET['usuario'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
if ($idUsuario !== false && $idUsuario !== null) {
    $condicoes[] = 'auditoria.usuario_id = ?';
    $parametros[] = $idUsuario;
}
$acoes = array_values(array_filter(
    explode(',', (string) ($_GET['acoes'] ?? '')),
    fn (string $acao): bool => preg_match('/^[a-z_]{1,40}$/', $acao) === 1,
));
if ($acoes !== []) {
    $condicoes[] = 'auditoria.acao IN (' . implode(', ', array_fill(0, count($acoes), '?')) . ')';
    array_push($parametros, ...$acoes);
}

// Busca um a mais para saber se ainda há registros depois desta página
$linhas = executarConsulta(
    'SELECT auditoria.id, auditoria.acao, auditoria.detalhes, auditoria.ip, auditoria.criado_em,
            usuarios.id AS id_usuario, usuarios.nome AS nome_usuario
     FROM auditoria LEFT JOIN usuarios ON usuarios.id = auditoria.usuario_id'
    . ($condicoes ? ' WHERE ' . implode(' AND ', $condicoes) : '')
    . ' ORDER BY auditoria.id DESC LIMIT ' . (REGISTROS_POR_PAGINA + 1),
    $parametros,
)->fetchAll();

$temMais = count($linhas) > REGISTROS_POR_PAGINA;
$registros = array_map(fn (array $linha): array => [
    'id' => (int) $linha['id'],
    'acao' => $linha['acao'],
    'detalhes' => json_decode($linha['detalhes'], true) ?: [],
    'ip' => $linha['ip'],
    'criadoEm' => $linha['criado_em'],
    'usuario' => $linha['id_usuario'] === null ? null : ['id' => (int) $linha['id_usuario'], 'nome' => $linha['nome_usuario']],
], array_slice($linhas, 0, REGISTROS_POR_PAGINA));

responderJson(['registros' => $registros, 'temMais' => $temMais]);
