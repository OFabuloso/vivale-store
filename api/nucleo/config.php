<?php
/**
 * Carrega a configuração secreta do backend.
 * O arquivo fica fora da public_html (e do Git), na pasta "config" ao lado dela:
 *   .../domains/vivalestore.com.br/config/vivale.php
 */
declare(strict_types=1);

function obterConfiguracao(): array
{
    static $configuracao = null;
    if ($configuracao === null) {
        // __DIR__ = .../public_html/api/nucleo → três níveis acima fica a pasta do domínio
        $caminhoConfiguracao = dirname(__DIR__, 3) . '/config/vivale.php';
        if (!is_readable($caminhoConfiguracao)) {
            throw new RuntimeException('Arquivo de configuração não encontrado: ' . $caminhoConfiguracao);
        }
        $configuracao = require $caminhoConfiguracao;
    }
    return $configuracao;
}

function estaEmAmbienteLocal(): bool
{
    return (obterConfiguracao()['ambiente_local'] ?? false) === true;
}
