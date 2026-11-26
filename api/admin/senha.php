<?php
/**
 * POST api/admin/senha.php — troca a senha de quem está logado.
 * Corpo: { senhaAtual, novaSenha }. Precisa de login.
 */
declare(strict_types=1);

require __DIR__ . '/../nucleo/inicio.php';

const TAMANHO_MINIMO_NOVA_SENHA = 10;

$usuario = exigirUsuarioLogado();
if (metodoDaRequisicao() !== 'POST') {
    recusarMetodo();
}

$dados = lerCorpoJson();
$senhaAtual = (string) ($dados['senhaAtual'] ?? '');
$novaSenha = (string) ($dados['novaSenha'] ?? '');

// Mesmo limite do login: impede adivinhar a senha atual a partir de uma sessão aberta
exigirSenhaCorreta($usuario, $senhaAtual);
if (mb_strlen($novaSenha) < TAMANHO_MINIMO_NOVA_SENHA) {
    throw new ErroDaApi(422, 'A nova senha precisa ter pelo menos ' . TAMANHO_MINIMO_NOVA_SENHA . ' caracteres.');
}
if (hash_equals($senhaAtual, $novaSenha)) {
    throw new ErroDaApi(422, 'A nova senha precisa ser diferente da atual.');
}

executarConsulta('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [gerarHashDeSenha($novaSenha), $usuario['id']]);
session_regenerate_id(true);
registrarAuditoria((int) $usuario['id'], 'senha_trocada');
responderJson(['senhaTrocada' => true]);
