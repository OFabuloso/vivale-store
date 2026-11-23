<?php
/**
 * PUT api/admin/contatos.php — salva a lista inteira de contatos de WhatsApp
 * (nome, número e ligado/desligado). Corpo: { contatos: [...] }. Só o dono.
 */
declare(strict_types=1);

require __DIR__ . '/../nucleo/inicio.php';

$usuario = exigirDono();
if (metodoDaRequisicao() !== 'PUT') {
    recusarMetodo();
}

$contatosValidados = validarContatos(lerCorpoJson()['contatos'] ?? null);
substituirContatos($contatosValidados);
registrarAuditoria((int) $usuario['id'], 'contatos_salvos', [
    'ligados' => array_column(array_filter($contatosValidados, fn (array $contato): bool => $contato['ativo']), 'nome'),
    'desligados' => array_column(array_filter($contatosValidados, fn (array $contato): bool => !$contato['ativo']), 'nome'),
]);
responderJson(['contatosWhatsApp' => listarContatos(false)]);
