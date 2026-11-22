<?php
/**
 * Sessão do painel.
 *   GET    → quem está logado (ou null) e o token CSRF para as próximas alterações
 *   POST   → login com { usuario, senha }
 *   DELETE → sair
 */
declare(strict_types=1);

require __DIR__ . '/nucleo/inicio.php';

iniciarSessao();

switch (metodoDaRequisicao()) {
    case 'GET':
        responderJson(['usuario' => obterUsuarioLogado(), 'tokenCsrf' => obterTokenCsrf()]);

    case 'POST':
        // O login também exige o token: impede que outro site faça login em nome da pessoa
        exigirTokenCsrf();
        $dados = lerCorpoJson();
        $usuario = fazerLogin(textoLimpo($dados['usuario'] ?? '', 40), (string) ($dados['senha'] ?? ''));
        responderJson(['usuario' => $usuario, 'tokenCsrf' => obterTokenCsrf()]);

    case 'DELETE':
        exigirTokenCsrf();
        $usuario = obterUsuarioLogado();
        if ($usuario !== null) {
            registrarAuditoria((int) $usuario['id'], 'logout');
        }
        encerrarSessao();
        responderJson(['usuario' => null]);

    default:
        recusarMetodo();
}
