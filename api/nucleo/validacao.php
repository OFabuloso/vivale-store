<?php
/**
 * Validação dos dados enviados pelo painel. Repete no servidor as regras do navegador
 * (js/telas/tela-admin.js e js/logica/contatos.js): o navegador ajuda, o servidor decide.
 */
declare(strict_types=1);

const TAMANHOS_PERMITIDOS = ['P', 'M', 'G', 'GG'];
const LIMITE_CONTATOS = 20;

function textoLimpo(mixed $valor, int $tamanhoMaximo): string
{
    $texto = trim(is_scalar($valor) ? (string) $valor : '');
    return mb_substr($texto, 0, $tamanhoMaximo);
}

function falhaDeValidacao(string $mensagem): never
{
    throw new ErroDaApi(422, $mensagem);
}

/** Endereço de foto aceito: fotos do projeto, fotos enviadas pelo painel ou link https. */
function fotoEhValida(string $foto): bool
{
    return $foto === ''
        || preg_match('#^img/produtos/[\w-]+\.jpe?g$#i', $foto) === 1
        || preg_match('#^fotos/[a-f0-9]{32}\.jpg$#', $foto) === 1
        || (preg_match('#^https://[^\s"\'<>]+$#i', $foto) === 1 && strlen($foto) <= 255);
}

/** Confere e normaliza um produto vindo do painel. */
function validarProduto(array $dados): array
{
    $nome = textoLimpo($dados['nome'] ?? '', 150);
    $categoria = textoLimpo($dados['categoria'] ?? '', 60);
    $descricao = textoLimpo($dados['descricao'] ?? '', 2000);
    $preco = is_numeric($dados['preco'] ?? null) ? round((float) $dados['preco'], 2) : 0.0;
    $foto = textoLimpo($dados['foto'] ?? '', 255);

    $tamanhos = array_values(array_intersect(TAMANHOS_PERMITIDOS, (array) ($dados['tamanhos'] ?? [])));
    $cores = [];
    foreach ((array) ($dados['cores'] ?? []) as $cor) {
        $corLimpa = textoLimpo($cor, 40);
        if ($corLimpa !== '' && !in_array($corLimpa, $cores, true)) {
            $cores[] = $corLimpa;
        }
    }

    if ($nome === '') {

        falhaDeValidacao('Informe o nome do produto.');

    }
    if ($categoria === '') {
        falhaDeValidacao('Informe a categoria.');
    }
    if ($preco <= 0 || $preco > 100000) {
        falhaDeValidacao('Informe um preço válido (ex.: 65,00).');
    }
    if ($tamanhos === []) {
        falhaDeValidacao('Selecione pelo menos um tamanho.');
    }
    if ($cores === []) {
        falhaDeValidacao('Informe pelo menos uma cor.');
    }
    if (count($cores) > 20) {
        falhaDeValidacao('Informe no máximo 20 cores.');
    }
    if (str_starts_with($foto, 'data:')) {
        falhaDeValidacao('Envie a foto de novo pelo botão de enviar arquivo.');
    }
    if (!fotoEhValida($foto)) {
        falhaDeValidacao('O endereço da foto é inválido. Use um link https.');
    }

    return [
        'nome' => $nome,
        'descricao' => $descricao,
        'categoria' => $categoria,
        'preco' => $preco,
        'foto' => $foto,
        'tamanhos' => $tamanhos,
        'cores' => $cores,
        'ativo' => ($dados['ativo'] ?? true) !== false,
    ];
}

/** Só dígitos; com DDD + número (10 ou 11 dígitos), acrescenta o 55 do Brasil. */
function normalizarTelefone(mixed $telefone): string
{
    $apenasDigitos = preg_replace('/\D/', '', is_scalar($telefone) ? (string) $telefone : '');
    return in_array(strlen($apenasDigitos), [10, 11], true) ? '55' . $apenasDigitos : $apenasDigitos;
}

function identificadorEhValido(mixed $identificador): bool
{
    return is_string($identificador) && preg_match('/^[A-Za-z0-9_-]{1,64}$/', $identificador) === 1;
}

function gerarIdentificador(string $prefixo): string
{
    return $prefixo . '-' . bin2hex(random_bytes(8));
}

/** Confere a lista de contatos editada no painel (mesmas regras de validarContatos no navegador). */
function validarContatos(mixed $listaContatos): array
{
    if (!is_array($listaContatos) || $listaContatos === []) {
        falhaDeValidacao('Cadastre pelo menos um contato de WhatsApp.');
    }
    if (count($listaContatos) > LIMITE_CONTATOS) {
        falhaDeValidacao('Cadastre no máximo ' . LIMITE_CONTATOS . ' contatos.');
    }

    $contatosValidados = [];
    $numerosUsados = [];
    foreach (array_values($listaContatos) as $posicao => $contato) {
        $contato = is_array($contato) ? $contato : [];
        $nome = textoLimpo($contato['nome'] ?? '', 40);
        $numero = normalizarTelefone($contato['numero'] ?? '');

        if ($nome === '') {

            falhaDeValidacao('Informe o nome do contato ' . ($posicao + 1) . '.');

        }
        if (!in_array(strlen($numero), [12, 13], true)) {
            falhaDeValidacao("O WhatsApp de \"{$nome}\" é inválido. Use DDD + número, ex.: (21) 99999-9999.");
        }
        if (isset($numerosUsados[$numero])) {
            falhaDeValidacao("O número de \"{$nome}\" já está em outro contato.");
        }

        $numerosUsados[$numero] = true;
        $contatosValidados[] = [
            'id' => identificadorEhValido($contato['id'] ?? null) ? $contato['id'] : gerarIdentificador('contato'),
            'nome' => $nome,
            'numero' => $numero,
            'ativo' => ($contato['ativo'] ?? true) !== false,
        ];
    }
    return $contatosValidados;
}

function validarValorMinimo(mixed $valor): float
{
    if (!is_numeric($valor) || (float) $valor < 0 || (float) $valor > 1000000) {
        falhaDeValidacao('Informe um valor mínimo válido (ex.: 300,00).');
    }
    return round((float) $valor, 2);
}
