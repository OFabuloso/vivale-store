<?php
/**
 * GET api/catalogo.php — catálogo público da loja (sem login).
 * Devolve só produtos ativos e contatos de WhatsApp ligados.
 */
declare(strict_types=1);

require __DIR__ . '/nucleo/inicio.php';

if (metodoDaRequisicao() !== 'GET') {
    recusarMetodo();
}

responderJson(montarCatalogoPublico());
