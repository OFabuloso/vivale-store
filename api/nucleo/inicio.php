<?php
/**
 * Carregado no topo de todo endpoint: junta as peças do núcleo.
 */
declare(strict_types=1);

require __DIR__ . '/resposta.php';
require __DIR__ . '/config.php';
require __DIR__ . '/banco.php';
require __DIR__ . '/auditoria.php';
require __DIR__ . '/sessao.php';
require __DIR__ . '/status.php';
require __DIR__ . '/autenticador.php';
require __DIR__ . '/validacao.php';
require __DIR__ . '/catalogo.php';
require __DIR__ . '/estoque.php';
