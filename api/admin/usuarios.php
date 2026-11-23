<?php
/**
 * Equipe do painel (só o dono).
 *   GET  → lista de todos os usuários
 *   POST → cadastra um funcionário: { usuario, nome, senha }
 *   PUT  → altera um funcionário: { id, ativo?, novaSenha? } (desativar ou redefinir a senha)
 * O dono não é alterado por aqui: a senha dele se troca em "Trocar minha senha".
 */
declare(strict_types=1);

require __DIR__ . '/../nucleo/inicio.php';

const TAMANHO_MINIMO_SENHA_FUNCIONARIO = 10;

/** Usuários sem a senha, com "ativo" como verdadeiro/falso. */
function listarUsuarios(): array
{
    $usuarios = executarConsulta(
        'SELECT id, usuario, nome, papel, ativo, ultimo_acesso FROM usuarios ORDER BY papel = ?, nome',
        [PAPEL_FUNCIONARIO],
    )->fetchAll();
    return array_map(fn (array $usuario): array => [
        'id' => (int) $usuario['id'],
        'usuario' => $usuario['usuario'],
        'nome' => $usuario['nome'],
        'papel' => $usuario['papel'],
        'ativo' => (bool) $usuario['ativo'],
        'ultimoAcesso' => $usuario['ultimo_acesso'],
    ], $usuarios);
}

function validarSenhaDoFuncionario(mixed $senha): string
{
    $senhaTexto = is_string($senha) ? $senha : '';
    if (mb_strlen($senhaTexto) < TAMANHO_MINIMO_SENHA_FUNCIONARIO) {
        falhaDeValidacao('A senha precisa ter pelo menos ' . TAMANHO_MINIMO_SENHA_FUNCIONARIO . ' caracteres.');
    }
    return $senhaTexto;
}

$dono = exigirDono();

switch (metodoDaRequisicao()) {
    case 'GET':
        responderJson(['usuarios' => listarUsuarios()]);

    case 'POST':
        $dados = lerCorpoJson();
        $nomeUsuario = mb_strtolower(textoLimpo($dados['usuario'] ?? '', 40));
        $nomeExibido = textoLimpo($dados['nome'] ?? '', 80);
        if (preg_match('/^[a-z0-9._-]{3,40}$/', $nomeUsuario) !== 1) {
            falhaDeValidacao('O usuário deve ter de 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado (sem espaço nem acento).');
        }
        if ($nomeExibido === '') {
            falhaDeValidacao('Informe o nome do funcionário.');
        }
        $senha = validarSenhaDoFuncionario($dados['senha'] ?? '');
        $jaExiste = executarConsulta('SELECT COUNT(*) FROM usuarios WHERE usuario = ?', [$nomeUsuario])->fetchColumn();
        if ((int) $jaExiste > 0) {
            throw new ErroDaApi(409, 'Já existe alguém com esse usuário. Escolha outro.');
        }
        executarConsulta(
            'INSERT INTO usuarios (usuario, nome, senha_hash, papel) VALUES (?, ?, ?, ?)',
            [$nomeUsuario, $nomeExibido, gerarHashDeSenha($senha), PAPEL_FUNCIONARIO],
        );
        registrarAuditoria((int) $dono['id'], 'funcionario_cadastrado', ['usuario' => $nomeUsuario]);
        responderJson(['usuarios' => listarUsuarios()], 201);

    case 'PUT':
        $dados = lerCorpoJson();
        $funcionario = executarConsulta(
            'SELECT id, usuario FROM usuarios WHERE id = ? AND papel = ?',
            [(int) ($dados['id'] ?? 0), PAPEL_FUNCIONARIO],
        )->fetch();
        if (!$funcionario) {
            throw new ErroDaApi(404, 'Funcionário não encontrado.');
        }
        if (array_key_exists('novaSenha', $dados)) {
            $novaSenha = validarSenhaDoFuncionario($dados['novaSenha']);
            executarConsulta('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [gerarHashDeSenha($novaSenha), $funcionario['id']]);
            // Senha nova também libera quem ficou bloqueado por errar a antiga
            executarConsulta('DELETE FROM tentativas_login WHERE usuario = ?', [$funcionario['usuario']]);
            registrarAuditoria((int) $dono['id'], 'funcionario_senha_redefinida', ['usuario' => $funcionario['usuario']]);
        }
        if (array_key_exists('ativo', $dados)) {
            $ativo = $dados['ativo'] === true;
            executarConsulta('UPDATE usuarios SET ativo = ? WHERE id = ?', [$ativo ? 1 : 0, $funcionario['id']]);
            registrarAuditoria((int) $dono['id'], $ativo ? 'funcionario_ativado' : 'funcionario_desativado', ['usuario' => $funcionario['usuario']]);
        }
        responderJson(['usuarios' => listarUsuarios()]);

    default:
        recusarMetodo();
}
