<?php
/**
 * Status de cada pessoa da equipe no painel: online, pausa, ausente ou offline.
 * É só informativo (o dono vê o de todos na aba Equipe); não mexe na loja.
 * Entrar deixa "online", Sair deixa "offline". Quem fecha o navegador sem sair deixa de dar
 * sinal (visto_em) e, depois de 10 minutos, aparece como offline.
 */
declare(strict_types=1);

const STATUS_PERMITIDOS = ['online', 'pausa', 'ausente', 'offline'];
const MINUTOS_SEM_SINAL_PARA_OFFLINE = 10;

/** Pedaço de SQL com o status que vale agora (offline se o painel parou de dar sinal). */
function sqlDoStatusEfetivo(): string
{
    return "CASE WHEN status <> 'offline' AND (visto_em IS NULL OR visto_em < NOW() - INTERVAL "
        . MINUTOS_SEM_SINAL_PARA_OFFLINE . " MINUTE) THEN 'offline' ELSE status END";
}

function validarStatus(mixed $status): string
{
    if (!is_string($status) || !in_array($status, STATUS_PERMITIDOS, true)) {
        falhaDeValidacao('Status inválido.');
    }
    return $status;
}

function definirStatus(int $idUsuario, string $status): void
{
    executarConsulta(
        'UPDATE usuarios SET status = ?, status_desde = NOW(), visto_em = NOW() WHERE id = ?',
        [$status, $idUsuario],
    );
}

/** O painel aberto avisa que continua aberto (no máximo uma gravação por minuto). */
function registrarSinalDoPainel(int $idUsuario): void
{
    executarConsulta(
        'UPDATE usuarios SET visto_em = NOW() WHERE id = ? AND (visto_em IS NULL OR visto_em < NOW() - INTERVAL 1 MINUTE)',
        [$idUsuario],
    );
}

/** { status, statusDesde } que valem agora para a pessoa. */
function obterStatus(int $idUsuario): array
{
    $linha = executarConsulta(
        'SELECT ' . sqlDoStatusEfetivo() . ' AS status_efetivo, status, status_desde, visto_em FROM usuarios WHERE id = ?',
        [$idUsuario],
    )->fetch();
    return montarStatusParaOPainel($linha ?: []);
}

/** Converte a linha do banco; quem caiu para offline por falta de sinal fica offline desde o último sinal. */
function montarStatusParaOPainel(array $linha): array
{
    $statusEfetivo = $linha['status_efetivo'] ?? 'offline';
    $caiuPorFaltaDeSinal = $statusEfetivo === 'offline' && ($linha['status'] ?? 'offline') !== 'offline';
    return [
        'status' => $statusEfetivo,
        'statusDesde' => $caiuPorFaltaDeSinal ? ($linha['visto_em'] ?? null) : ($linha['status_desde'] ?? null),
    ];
}
