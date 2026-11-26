<?php
/**
 * Verificação em duas etapas (2FA) de quem está logado.
 *   GET  → { ativo, codigosRestantes }
 *   POST { acao: 'iniciar', senha }           → { segredo, enderecoOtpauth } para o QR code
 *   POST { acao: 'confirmar', codigo }        → liga o 2FA e devolve os códigos de recuperação
 *   POST { acao: 'desativar', senha, codigo } → desliga o 2FA
 *   POST { acao: 'novosCodigos', codigo }     → troca os códigos de recuperação por 10 novos
 * Pedir a senha para iniciar impede que alguém com a sessão aberta ligue o 2FA no próprio
 * celular e tranque o dono do lado de fora.
 */
declare(strict_types=1);

require __DIR__ . '/../nucleo/inicio.php';

$usuario = exigirUsuarioLogado();
$idUsuario = (int) $usuario['id'];

function situacaoDoDoisFatores(int $idUsuario): array
{
    $ativo = obterDoisFatoresDoUsuario($idUsuario) !== null;
    return ['ativo' => $ativo, 'codigosRestantes' => $ativo ? contarCodigosDeRecuperacaoRestantes($idUsuario) : 0];
}

/** Confere o código do app ou de recuperação, contando o erro para o limite de tentativas. */
function exigirCodigoCorreto(array $usuario, string $codigo): void
{
    recusarSeHouverTentativasDemais($usuario['usuario']);
    if (conferirSegundoFator((int) $usuario['id'], $codigo) === null) {
        registrarTentativaErrada($usuario['usuario']);
        throw new ErroDaApi(422, 'Código incorreto. Confira o app e tente de novo.');
    }
}

if (metodoDaRequisicao() === 'GET') {
    responderJson(situacaoDoDoisFatores($idUsuario));
}
if (metodoDaRequisicao() !== 'POST') {
    recusarMetodo();
}

$dados = lerCorpoJson();
$codigo = textoLimpo($dados['codigo'] ?? '', 20);
$doisFatoresAtivo = obterDoisFatoresDoUsuario($idUsuario) !== null;

switch ($dados['acao'] ?? '') {
    case 'iniciar':
        if ($doisFatoresAtivo) {
            throw new ErroDaApi(409, 'A verificação em duas etapas já está ativa.');
        }
        exigirSenhaCorreta($usuario, (string) ($dados['senha'] ?? ''), 'Senha incorreta.');
        // O segredo só vai para o banco depois que a pessoa provar que o app já gera os códigos
        $segredo = gerarSegredoTotp();
        $_SESSION['totp_pendente'] = $segredo;
        responderJson(['segredo' => $segredo, 'enderecoOtpauth' => montarEnderecoOtpauth($usuario['usuario'], $segredo)]);

    case 'confirmar':
        $segredoPendente = $_SESSION['totp_pendente'] ?? null;
        if ($doisFatoresAtivo || $segredoPendente === null) {
            throw new ErroDaApi(409, 'Comece de novo pelo botão "Ativar".');
        }
        recusarSeHouverTentativasDemais($usuario['usuario']);
        $passo = encontrarPassoDoCodigo($segredoPendente, preg_replace('/\s+/', '', $codigo), null);
        if ($passo === null) {
            registrarTentativaErrada($usuario['usuario']);
            throw new ErroDaApi(422, 'Código incorreto. Confira se escaneou o QR code e digite o código atual do app.');
        }
        $codigosRecuperacao = ativarDoisFatores($idUsuario, $segredoPendente, $passo);
        unset($_SESSION['totp_pendente']);
        registrarAuditoria($idUsuario, 'dois_fatores_ativado');
        responderJson(['codigosRecuperacao' => $codigosRecuperacao] + situacaoDoDoisFatores($idUsuario));

    case 'desativar':
        if (!$doisFatoresAtivo) {
            throw new ErroDaApi(409, 'A verificação em duas etapas já está desligada.');
        }
        exigirSenhaCorreta($usuario, (string) ($dados['senha'] ?? ''), 'Senha incorreta.');
        exigirCodigoCorreto($usuario, $codigo);
        desativarDoisFatores($idUsuario);
        registrarAuditoria($idUsuario, 'dois_fatores_desativado');
        responderJson(situacaoDoDoisFatores($idUsuario));

    case 'novosCodigos':
        if (!$doisFatoresAtivo) {
            throw new ErroDaApi(409, 'Ative a verificação em duas etapas primeiro.');
        }
        exigirCodigoCorreto($usuario, $codigo);
        $codigosRecuperacao = substituirCodigosDeRecuperacao($idUsuario);
        registrarAuditoria($idUsuario, 'codigos_recuperacao_trocados');
        responderJson(['codigosRecuperacao' => $codigosRecuperacao] + situacaoDoDoisFatores($idUsuario));

    default:
        throw new ErroDaApi(422, 'Ação desconhecida.');
}
