<?php
/**
 * Sessão do painel.
 *   GET    → quem está logado (ou null) e o token CSRF para as próximas alterações
 *   POST   → login com { usuario, senha }; se a pessoa usa 2FA, a resposta traz precisaCodigo: true
 *            e o login termina com um segundo POST { codigo } (do app ou de recuperação)
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
        if (array_key_exists('codigo', $dados)) {
            $usuario = confirmarCodigoDoLogin(textoLimpo($dados['codigo'], 20));
        } else {
            $usuario = fazerLogin(textoLimpo($dados['usuario'] ?? '', 40), (string) ($dados['senha'] ?? ''));
        }
        responderJson(['usuario' => $usuario, 'precisaCodigo' => $usuario === null, 'tokenCsrf' => obterTokenCsrf()]);

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
