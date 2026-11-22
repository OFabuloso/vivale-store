<?php
/**
 * Cria (ou troca a senha de) um usuário do painel. Só roda no terminal, nunca pelo site.
 *
 * Uso no servidor (SSH) ou no Docker:
 *   php ferramentas/criar-usuario.php dono "Nome do Dono"
 * A senha é pedida no terminal sem aparecer na tela.
 *
 * Sem acesso ao banco, gere só o hash e cole no phpMyAdmin:
 *   php ferramentas/criar-usuario.php --somente-hash
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

const TAMANHO_MINIMO_SENHA = 10;

/** Lê a senha sem mostrar o que é digitado (ou da entrada padrão, nos testes automatizados). */
function lerSenhaEscondida(string $pergunta): string
{
    if (!stream_isatty(STDIN)) {
        return rtrim((string) fgets(STDIN), "\r\n");
    }
    fwrite(STDOUT, $pergunta);
    shell_exec('stty -echo');
    $senha = rtrim((string) fgets(STDIN), "\r\n");
    shell_exec('stty echo');
    fwrite(STDOUT, PHP_EOL);
    return $senha;
}

function pedirSenhaNova(): string
{
    $senha = lerSenhaEscondida('Senha (mínimo ' . TAMANHO_MINIMO_SENHA . ' caracteres): ');
    if (mb_strlen($senha) < TAMANHO_MINIMO_SENHA) {
        fwrite(STDERR, 'A senha precisa ter pelo menos ' . TAMANHO_MINIMO_SENHA . " caracteres.\n");
        exit(1);
    }
    if (stream_isatty(STDIN) && lerSenhaEscondida('Repita a senha: ') !== $senha) {
        fwrite(STDERR, "As senhas não conferem.\n");
        exit(1);
    }
    return $senha;
}

$algoritmo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT;

if (($argv[1] ?? '') === '--somente-hash') {
    fwrite(STDOUT, password_hash(pedirSenhaNova(), $algoritmo) . PHP_EOL);
    exit(0);
}

$nomeUsuario = $argv[1] ?? '';
$nomeExibido = $argv[2] ?? $nomeUsuario;
if (preg_match('/^[a-z0-9._-]{3,40}$/', $nomeUsuario) !== 1) {
    fwrite(STDERR, "Uso: php ferramentas/criar-usuario.php <usuario> [\"Nome exibido\"]\n");
    fwrite(STDERR, "O usuário deve ter de 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado.\n");
    exit(1);
}

require __DIR__ . '/../api/nucleo/resposta.php';
require __DIR__ . '/../api/nucleo/config.php';
require __DIR__ . '/../api/nucleo/banco.php';

$hashDaSenha = password_hash(pedirSenhaNova(), $algoritmo);
executarConsulta(
    "INSERT INTO usuarios (usuario, nome, senha_hash, papel) VALUES (?, ?, ?, 'dono')
     ON DUPLICATE KEY UPDATE senha_hash = VALUES(senha_hash), nome = VALUES(nome), ativo = 1",
    [$nomeUsuario, $nomeExibido, $hashDaSenha],
);
fwrite(STDOUT, "Usuário \"{$nomeUsuario}\" pronto para entrar no painel.\n");
