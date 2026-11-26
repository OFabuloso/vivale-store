<?php
/**
 * Verificação em duas etapas (2FA) com app autenticador (Google Authenticator, Authy...).
 * Segue o padrão TOTP (RFC 6238): código de 6 dígitos que muda a cada 30 segundos.
 *
 * O segredo de cada pessoa fica criptografado no banco com a "chave_criptografia" do arquivo de
 * configuração (fora da public_html e do Git): um backup ou uma cópia do banco, sozinhos, não
 * permitem gerar os códigos.
 *
 * Se o dono perder o celular e os códigos de recuperação, o 2FA dele é desligado no phpMyAdmin:
 *   UPDATE usuarios SET totp_segredo = NULL, totp_ultimo_passo = NULL WHERE usuario = 'dono';
 */
declare(strict_types=1);

const NOME_DO_EMISSOR_TOTP = 'Vivale Store';
const SEGUNDOS_POR_CODIGO = 30;
const DIGITOS_DO_CODIGO = 6;
// Aceita o código anterior e o seguinte: cobre relógio do celular um pouco adiantado ou atrasado
const PASSOS_DE_TOLERANCIA = 1;
const BYTES_DO_SEGREDO = 20;
const QUANTIDADE_CODIGOS_RECUPERACAO = 10;
// Sem letras e números parecidos (0/o, 1/l/i), para não errar ao digitar
const ALFABETO_CODIGO_RECUPERACAO = 'abcdefghjkmnpqrstuvwxyz23456789';
const ALFABETO_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// ---------- Criptografia do segredo ----------

function chaveDeCriptografia(): string
{
    $chaveTexto = (string) (obterConfiguracao()['chave_criptografia'] ?? '');
    $chave = base64_decode($chaveTexto, true);
    if ($chave === false || strlen($chave) !== SODIUM_CRYPTO_SECRETBOX_KEYBYTES) {
        throw new RuntimeException('Falta a "chave_criptografia" (32 bytes em base64) no arquivo de configuração.');
    }
    return $chave;
}

function criptografarSegredo(string $segredo): string
{
    $numeroUnico = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
    return base64_encode($numeroUnico . sodium_crypto_secretbox($segredo, $numeroUnico, chaveDeCriptografia()));
}

function descriptografarSegredo(string $segredoCriptografado): string
{
    $conteudo = base64_decode($segredoCriptografado, true);
    $numeroUnico = substr((string) $conteudo, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
    $cifrado = substr((string) $conteudo, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
    $segredo = $conteudo === false ? false : sodium_crypto_secretbox_open($cifrado, $numeroUnico, chaveDeCriptografia());
    if ($segredo === false) {
        throw new RuntimeException('Não foi possível ler o segredo do 2FA (a chave de criptografia mudou?).');
    }
    return $segredo;
}

// ---------- Códigos TOTP ----------

/** Base32 é o formato que os apps autenticadores usam para o segredo. */
function codificarBase32(string $bytes): string
{
    $bits = '';
    foreach (str_split($bytes) as $byte) {
        $bits .= str_pad(decbin(ord($byte)), 8, '0', STR_PAD_LEFT);
    }
    $texto = '';
    foreach (str_split($bits, 5) as $grupoDeBits) {
        $texto .= ALFABETO_BASE32[bindec(str_pad($grupoDeBits, 5, '0'))];
    }
    return $texto;
}

function decodificarBase32(string $texto): string
{
    $bits = '';
    foreach (str_split(strtoupper($texto)) as $letra) {
        $posicao = strpos(ALFABETO_BASE32, $letra);
        if ($posicao === false) {
            throw new InvalidArgumentException('Segredo em Base32 inválido.');
        }
        $bits .= str_pad(decbin($posicao), 5, '0', STR_PAD_LEFT);
    }
    $bytes = '';
    foreach (str_split($bits, 8) as $grupoDeBits) {
        if (strlen($grupoDeBits) === 8) {
            $bytes .= chr(bindec($grupoDeBits));
        }
    }
    return $bytes;
}

function gerarSegredoTotp(): string
{
    return codificarBase32(random_bytes(BYTES_DO_SEGREDO));
}

/** Código de 6 dígitos para um intervalo de 30 segundos ("passo"), como o app calcula. */
function calcularCodigoTotp(string $segredoBase32, int $passo): string
{
    $assinatura = hash_hmac('sha1', pack('J', $passo), decodificarBase32($segredoBase32), true);
    $deslocamento = ord($assinatura[19]) & 0x0f;
    $numero = unpack('N', substr($assinatura, $deslocamento, 4))[1] & 0x7fffffff;
    return str_pad((string) ($numero % (10 ** DIGITOS_DO_CODIGO)), DIGITOS_DO_CODIGO, '0', STR_PAD_LEFT);
}

/**
 * Devolve o passo do código, se ele for válido agora e mais novo que o último já usado
 * (o mesmo código não serve duas vezes). Devolve null se não valer.
 */
function encontrarPassoDoCodigo(string $segredoBase32, string $codigo, ?int $ultimoPassoUsado): ?int
{
    if (preg_match('/^\d{' . DIGITOS_DO_CODIGO . '}$/', $codigo) !== 1) {
        return null;
    }
    $passoAtual = intdiv(time(), SEGUNDOS_POR_CODIGO);
    for ($diferenca = -PASSOS_DE_TOLERANCIA; $diferenca <= PASSOS_DE_TOLERANCIA; $diferenca++) {
        $passo = $passoAtual + $diferenca;
        if (($ultimoPassoUsado === null || $passo > $ultimoPassoUsado)
            && hash_equals(calcularCodigoTotp($segredoBase32, $passo), $codigo)) {
            return $passo;
        }
    }
    return null;
}

/** Endereço que o QR code leva para o app autenticador. */
function montarEnderecoOtpauth(string $nomeUsuario, string $segredoBase32): string
{
    $rotulo = rawurlencode(NOME_DO_EMISSOR_TOTP . ':' . $nomeUsuario);
    return "otpauth://totp/{$rotulo}?" . http_build_query([
        'secret' => $segredoBase32,
        'issuer' => NOME_DO_EMISSOR_TOTP,
        'digits' => DIGITOS_DO_CODIGO,
        'period' => SEGUNDOS_POR_CODIGO,
    ], '', '&', PHP_QUERY_RFC3986);
}

// ---------- Códigos de recuperação ----------

function gerarCodigoDeRecuperacao(): string
{
    $letras = '';
    for ($posicao = 0; $posicao < 8; $posicao++) {
        $letras .= ALFABETO_CODIGO_RECUPERACAO[random_int(0, strlen(ALFABETO_CODIGO_RECUPERACAO) - 1)];
    }
    return substr($letras, 0, 4) . '-' . substr($letras, 4);
}

/** Aceita o código com ou sem hífen, maiúsculo ou minúsculo. */
function normalizarCodigoDeRecuperacao(string $codigo): string
{
    $letras = preg_replace('/[^a-z0-9]/', '', strtolower($codigo));
    return strlen($letras) === 8 ? substr($letras, 0, 4) . '-' . substr($letras, 4) : '';
}

/** Troca os códigos de recuperação da pessoa por 10 novos e os devolve (só aparecem esta vez). */
function substituirCodigosDeRecuperacao(int $idUsuario): array
{
    $codigos = array_map(fn (): string => gerarCodigoDeRecuperacao(), range(1, QUANTIDADE_CODIGOS_RECUPERACAO));
    emTransacao(function () use ($idUsuario, $codigos): void {
        executarConsulta('DELETE FROM codigos_recuperacao WHERE usuario_id = ?', [$idUsuario]);
        foreach ($codigos as $codigo) {
            executarConsulta(
                'INSERT INTO codigos_recuperacao (usuario_id, codigo_hash) VALUES (?, ?)',
                [$idUsuario, gerarHashDeSenha($codigo)],
            );
        }
    });
    return $codigos;
}

function usarCodigoDeRecuperacao(int $idUsuario, string $codigoDigitado): bool
{
    $codigo = normalizarCodigoDeRecuperacao($codigoDigitado);
    if ($codigo === '') {
        return false;
    }
    $codigosGuardados = executarConsulta(
        'SELECT id, codigo_hash FROM codigos_recuperacao WHERE usuario_id = ? AND usado_em IS NULL',
        [$idUsuario],
    )->fetchAll();
    foreach ($codigosGuardados as $codigoGuardado) {
        if (password_verify($codigo, $codigoGuardado['codigo_hash'])) {
            executarConsulta('UPDATE codigos_recuperacao SET usado_em = NOW() WHERE id = ?', [$codigoGuardado['id']]);
            return true;
        }
    }
    return false;
}

function contarCodigosDeRecuperacaoRestantes(int $idUsuario): int
{
    return (int) executarConsulta(
        'SELECT COUNT(*) FROM codigos_recuperacao WHERE usuario_id = ? AND usado_em IS NULL',
        [$idUsuario],
    )->fetchColumn();
}

// ---------- Situação de cada pessoa ----------

/** Segredo do 2FA (já descriptografado) e último passo usado, ou null se o 2FA estiver desligado. */
function obterDoisFatoresDoUsuario(int $idUsuario): ?array
{
    $linha = executarConsulta(
        'SELECT totp_segredo, totp_ultimo_passo FROM usuarios WHERE id = ?',
        [$idUsuario],
    )->fetch();
    if (!$linha || $linha['totp_segredo'] === null) {
        return null;
    }
    return [
        'segredo' => descriptografarSegredo($linha['totp_segredo']),
        'ultimoPasso' => $linha['totp_ultimo_passo'] === null ? null : (int) $linha['totp_ultimo_passo'],
    ];
}

/**
 * Confere o código do app (ou um código de recuperação) da pessoa.
 * Devolve 'app', 'recuperacao' ou null (código errado).
 */
function conferirSegundoFator(int $idUsuario, string $codigoDigitado): ?string
{
    $doisFatores = obterDoisFatoresDoUsuario($idUsuario);
    if ($doisFatores === null) {
        return null;
    }
    $codigoSemEspacos = preg_replace('/\s+/', '', $codigoDigitado);
    $passo = encontrarPassoDoCodigo($doisFatores['segredo'], $codigoSemEspacos, $doisFatores['ultimoPasso']);
    if ($passo !== null) {
        executarConsulta('UPDATE usuarios SET totp_ultimo_passo = ? WHERE id = ?', [$passo, $idUsuario]);
        return 'app';
    }
    return usarCodigoDeRecuperacao($idUsuario, $codigoSemEspacos) ? 'recuperacao' : null;
}

function ativarDoisFatores(int $idUsuario, string $segredoBase32, int $passoUsado): array
{
    executarConsulta(
        'UPDATE usuarios SET totp_segredo = ?, totp_ultimo_passo = ? WHERE id = ?',
        [criptografarSegredo($segredoBase32), $passoUsado, $idUsuario],
    );
    return substituirCodigosDeRecuperacao($idUsuario);
}

function desativarDoisFatores(int $idUsuario): void
{
    emTransacao(function () use ($idUsuario): void {
        executarConsulta('UPDATE usuarios SET totp_segredo = NULL, totp_ultimo_passo = NULL WHERE id = ?', [$idUsuario]);
        executarConsulta('DELETE FROM codigos_recuperacao WHERE usuario_id = ?', [$idUsuario]);
    });
}
