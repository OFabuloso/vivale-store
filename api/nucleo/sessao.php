<?php
/**
 * Login do painel: sessão segura, proteção CSRF e limite de tentativas erradas.
 */
declare(strict_types=1);

const TEMPO_MAXIMO_PARADO_SEGUNDOS = 2 * 60 * 60;
const JANELA_TENTATIVAS_MINUTOS = 15;
const LIMITE_TENTATIVAS_POR_USUARIO = 5;
const LIMITE_TENTATIVAS_POR_IP = 20;
const PAPEL_DONO = 'dono';
const PAPEL_FUNCIONARIO = 'funcionario';
// Tempo para digitar o código do app depois de acertar a senha
const SEGUNDOS_PARA_DIGITAR_CODIGO = 5 * 60;
const MENSAGEM_MUITAS_TENTATIVAS = 'Muitas tentativas com erro. Aguarde 15 minutos e tente de novo.';

function iniciarSessao(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_name('vivale_sessao');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => !estaEmAmbienteLocal(),
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();

    // Sessão parada há muito tempo é encerrada
    $ultimoMovimento = $_SESSION['ultimo_movimento'] ?? null;
    if ($ultimoMovimento !== null && time() - $ultimoMovimento > TEMPO_MAXIMO_PARADO_SEGUNDOS) {
        encerrarSessao();
        session_start();
    }
    $_SESSION['ultimo_movimento'] = time();
}

function encerrarSessao(): void
{
    $_SESSION = [];
    if (session_status() === PHP_SESSION_ACTIVE) {
        $parametrosCookie = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 3600,
            'path' => $parametrosCookie['path'],
            'secure' => $parametrosCookie['secure'],
            'httponly' => true,
            'samesite' => 'Strict',
        ]);
        session_destroy();
    }
}

function obterTokenCsrf(): string
{
    if (empty($_SESSION['token_csrf'])) {
        $_SESSION['token_csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['token_csrf'];
}

/**
 * Toda alteração (POST, PUT, DELETE) precisa vir do próprio site:
 * mesma origem e com o token CSRF da sessão no cabeçalho X-CSRF-Token.
 */
function exigirTokenCsrf(): void
{
    $origem = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origem !== '' && !origemEhDoProprioSite($origem)) {
        throw new ErroDaApi(403, 'Requisição de origem não permitida.');
    }
    $tokenRecebido = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    $tokenDaSessao = (string) ($_SESSION['token_csrf'] ?? '');
    if ($tokenDaSessao === '' || !hash_equals($tokenDaSessao, $tokenRecebido)) {
        throw new ErroDaApi(403, 'Sessão expirada. Recarregue a página e tente de novo.');
    }
}

/** Compara nome e porta da origem com o endereço pedido (HTTP_HOST traz a porta, se houver). */
function origemEhDoProprioSite(string $origem): bool
{
    $nomeDaOrigem = parse_url($origem, PHP_URL_HOST);
    if (!is_string($nomeDaOrigem)) {
        return false;
    }
    $portaDaOrigem = parse_url($origem, PHP_URL_PORT);
    $enderecoDaOrigem = $nomeDaOrigem . ($portaDaOrigem !== null ? ':' . $portaDaOrigem : '');
    return strcasecmp($enderecoDaOrigem, (string) ($_SERVER['HTTP_HOST'] ?? '')) === 0;
}

/** Usuário da sessão atual, conferido no banco (um usuário desativado perde o acesso na hora). */
function obterUsuarioLogado(): ?array
{
    $idUsuario = $_SESSION['id_usuario'] ?? null;
    if ($idUsuario === null) {
        return null;
    }
    $usuario = executarConsulta(
        'SELECT id, usuario, nome, papel FROM usuarios WHERE id = ? AND ativo = 1',
        [$idUsuario],
    )->fetch();
    return $usuario ?: null;
}

/** Garante que há alguém logado; para alterações, também confere o token CSRF. */
function exigirUsuarioLogado(): array
{
    iniciarSessao();
    $usuario = obterUsuarioLogado();
    if ($usuario === null) {
        throw new ErroDaApi(401, 'Faça login para continuar.');
    }
    if (metodoDaRequisicao() !== 'GET') {
        exigirTokenCsrf();
    }
    registrarSinalDoPainel((int) $usuario['id']);
    return $usuario;
}

/** Como exigirUsuarioLogado, mas só deixa passar o dono (equipe, contatos, configurações e exclusões). */
function exigirDono(): array
{
    $usuario = exigirUsuarioLogado();
    if ($usuario['papel'] !== PAPEL_DONO) {
        throw new ErroDaApi(403, 'Só o dono da loja pode fazer isso.');
    }
    return $usuario;
}

function contarTentativasRecentes(string $coluna, string $valor): int
{
    // A coluna vem só das chamadas abaixo, nunca de quem faz a requisição
    $sql = "SELECT COUNT(*) FROM tentativas_login
            WHERE {$coluna} = ? AND criado_em > (NOW() - INTERVAL " . JANELA_TENTATIVAS_MINUTOS . ' MINUTE)';
    return (int) executarConsulta($sql, [$valor])->fetchColumn();
}

function registrarTentativaErrada(string $nomeUsuario): void
{
    executarConsulta('INSERT INTO tentativas_login (ip, usuario) VALUES (?, ?)', [ipDaRequisicao(), $nomeUsuario]);
}

function recusarSeHouverTentativasDemais(string $nomeUsuario): void
{
    if (
        contarTentativasRecentes('usuario', $nomeUsuario) >= LIMITE_TENTATIVAS_POR_USUARIO
        || contarTentativasRecentes('ip', ipDaRequisicao()) >= LIMITE_TENTATIVAS_POR_IP
    ) {
        throw new ErroDaApi(429, MENSAGEM_MUITAS_TENTATIVAS);
    }
}

/**
 * Primeira etapa do login: confere usuário e senha.
 * Sem 2FA, já entra e devolve o usuário. Com 2FA, guarda o login como pendente e devolve null:
 * a pessoa precisa confirmar o código do app em confirmarCodigoDoLogin().
 */
function fazerLogin(string $nomeUsuario, string $senha): ?array
{
    recusarSeHouverTentativasDemais($nomeUsuario);

    $usuario = executarConsulta(
        'SELECT id, usuario, nome, papel, senha_hash FROM usuarios WHERE usuario = ? AND ativo = 1',
        [$nomeUsuario],
    )->fetch();

    if ($usuario) {
        $senhaCorreta = password_verify($senha, $usuario['senha_hash']);
    } else {
        // Gasta o mesmo tempo de uma conferência: a resposta não revela se o usuário existe
        gerarHashDeSenha($senha);
        $senhaCorreta = false;
    }

    if (!$usuario || !$senhaCorreta) {
        registrarTentativaErrada($nomeUsuario);
        throw new ErroDaApi(401, 'Usuário ou senha incorretos.');
    }

    if (password_needs_rehash($usuario['senha_hash'], algoritmoDeSenha())) {
        executarConsulta('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [gerarHashDeSenha($senha), $usuario['id']]);
    }
    unset($usuario['senha_hash']);

    if (obterDoisFatoresDoUsuario((int) $usuario['id']) !== null) {
        // Senha certa, mas ainda não entrou: falta o código do app
        session_regenerate_id(true);
        $_SESSION['login_pendente'] = ['id_usuario' => (int) $usuario['id'], 'expira_em' => time() + SEGUNDOS_PARA_DIGITAR_CODIGO];
        return null;
    }
    return concluirLogin($usuario);
}

/** Segunda etapa do login: código do app autenticador ou código de recuperação. */
function confirmarCodigoDoLogin(string $codigo): array
{
    $pendente = $_SESSION['login_pendente'] ?? null;
    if ($pendente === null || $pendente['expira_em'] < time()) {
        unset($_SESSION['login_pendente']);
        throw new ErroDaApi(401, 'O tempo para digitar o código acabou. Entre com a senha de novo.');
    }
    $usuario = executarConsulta(
        'SELECT id, usuario, nome, papel FROM usuarios WHERE id = ? AND ativo = 1',
        [$pendente['id_usuario']],
    )->fetch();
    if (!$usuario) {
        unset($_SESSION['login_pendente']);
        throw new ErroDaApi(401, 'Usuário ou senha incorretos.');
    }

    recusarSeHouverTentativasDemais($usuario['usuario']);
    $tipoDeCodigo = conferirSegundoFator((int) $usuario['id'], $codigo);
    if ($tipoDeCodigo === null) {
        registrarTentativaErrada($usuario['usuario']);
        throw new ErroDaApi(422, 'Código incorreto. Confira o app e tente de novo.');
    }
    unset($_SESSION['login_pendente']);
    if ($tipoDeCodigo === 'recuperacao') {
        registrarAuditoria((int) $usuario['id'], 'codigo_recuperacao_usado');
    }
    return concluirLogin($usuario);
}

/** Login completo: abre a sessão da pessoa. */
function concluirLogin(array $usuario): array
{
    executarConsulta('DELETE FROM tentativas_login WHERE usuario = ?', [$usuario['usuario']]);
    executarConsulta('UPDATE usuarios SET ultimo_acesso = NOW() WHERE id = ?', [$usuario['id']]);
    definirStatus((int) $usuario['id'], 'online');

    // Novo identificador de sessão a cada login (evita sequestro de sessão)
    session_regenerate_id(true);
    $_SESSION['id_usuario'] = (int) $usuario['id'];
    $_SESSION['token_csrf'] = bin2hex(random_bytes(32));
    registrarAuditoria((int) $usuario['id'], 'login');
    return $usuario;
}

/** Para ações sensíveis com a sessão já aberta: confere a senha, com o mesmo limite de erros do login. */
function exigirSenhaCorreta(array $usuario, string $senha, string $mensagemDeErro = 'A senha atual está incorreta.'): void
{
    if (contarTentativasRecentes('usuario', $usuario['usuario']) >= LIMITE_TENTATIVAS_POR_USUARIO) {
        throw new ErroDaApi(429, MENSAGEM_MUITAS_TENTATIVAS);
    }
    $hashDaSenha = executarConsulta('SELECT senha_hash FROM usuarios WHERE id = ?', [$usuario['id']])->fetchColumn();
    if (!password_verify($senha, (string) $hashDaSenha)) {
        registrarTentativaErrada($usuario['usuario']);
        throw new ErroDaApi(422, $mensagemDeErro);
    }
}

function algoritmoDeSenha(): string
{
    return defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT;
}

function gerarHashDeSenha(string $senha): string
{
    return password_hash($senha, algoritmoDeSenha());
}
