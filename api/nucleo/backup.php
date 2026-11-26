<?php
/**
 * Backup completo da loja num .zip: o banco inteiro (banco.sql) e as fotos enviadas pelo painel.
 * Usado pelo botão do painel (api/admin/backup.php) e pela cópia automática diária
 * (ferramentas/backup.php, rodado pelo cron da Hostinger).
 *
 * Para restaurar: importar o banco.sql no phpMyAdmin e enviar a pasta fotos/ para "uploads".
 * As instruções vão junto, no LEIA-ME.txt de cada backup.
 */
declare(strict_types=1);

// Tentativas de login são passageiras (valem 15 minutos): vai só a estrutura da tabela
const TABELAS_SEM_DADOS_NO_BACKUP = ['tentativas_login'];
const LINHAS_POR_INSERT = 100;
const BACKUPS_AUTOMATICOS_GUARDADOS = 14;
const FUSO_DA_LOJA = 'America/Sao_Paulo';

const INSTRUCOES_DE_RESTAURACAO = <<<'TEXTO'
    Backup da Vivale Store
    ======================

    Este arquivo tem tudo o que a loja guarda no servidor:
      banco.sql  -> produtos, atendentes, configurações, usuários do painel e registro de ações
      fotos/     -> fotos enviadas pelo painel

    Guarde este arquivo em lugar seguro (computador e Google Drive, por exemplo).
    Ele contém os dados da equipe; as senhas estão protegidas (só o "hash"), mas não compartilhe.

    Como restaurar na Hostinger
    1. hPanel > Bancos de dados > phpMyAdmin > selecione o banco da loja > aba Importar.
       Envie o banco.sql. ATENÇÃO: ele substitui tudo o que estiver no banco agora.
    2. Gerenciador de Arquivos > domains/vivalestore.com.br/uploads:
       envie os arquivos de dentro da pasta fotos/ deste backup.
    TEXTO;

/** Agora no horário de Brasília (o servidor pode estar em outro fuso). */
function agoraNoFusoDaLoja(): DateTimeImmutable
{
    return new DateTimeImmutable('now', new DateTimeZone(FUSO_DA_LOJA));
}

/** Pasta dos backups automáticos: ao lado de "uploads", fora da public_html. */
function pastaDeBackups(): string
{
    $configuracao = obterConfiguracao();
    $pasta = $configuracao['pasta_backups'] ?? dirname($configuracao['pasta_uploads']) . '/backups';
    if (!is_dir($pasta) && !mkdir($pasta, 0750, true)) {
        throw new RuntimeException('Não foi possível criar a pasta de backups: ' . $pasta);
    }
    return $pasta;
}

/** Escreve no arquivo um SQL que recria todas as tabelas com os dados atuais. */
function gravarCopiaDoBanco(string $caminhoArquivoSql): void
{
    $conexao = conexaoComBanco();
    $arquivo = fopen($caminhoArquivoSql, 'wb');
    if ($arquivo === false) {
        throw new RuntimeException('Não foi possível criar o arquivo do banco.');
    }
    try {
        fwrite($arquivo, '-- Backup da Vivale Store em ' . agoraNoFusoDaLoja()->format('d/m/Y H:i:s') . "\n");
        fwrite($arquivo, "-- Importar substitui todas as tabelas abaixo pelos dados desta cópia.\n\n");
        fwrite($arquivo, "SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\n\n");

        $tabelas = $conexao->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
        foreach ($tabelas as $nomeTabela) {
            $nomeProtegido = '`' . str_replace('`', '``', $nomeTabela) . '`';
            $comandoCriacao = $conexao->query("SHOW CREATE TABLE {$nomeProtegido}")->fetch(PDO::FETCH_NUM)[1];
            fwrite($arquivo, "DROP TABLE IF EXISTS {$nomeProtegido};\n{$comandoCriacao};\n\n");

            if (in_array($nomeTabela, TABELAS_SEM_DADOS_NO_BACKUP, true)) {
                continue;
            }
            $consulta = $conexao->query("SELECT * FROM {$nomeProtegido}");
            $linhasPendentes = [];
            $colunas = null;
            while (($linha = $consulta->fetch(PDO::FETCH_ASSOC)) !== false) {
                $colunas ??= implode(', ', array_map(fn (string $coluna): string => '`' . $coluna . '`', array_keys($linha)));
                $linhasPendentes[] = '(' . implode(', ', array_map(
                    fn (mixed $valor): string => $valor === null ? 'NULL' : $conexao->quote((string) $valor),
                    $linha,
                )) . ')';
                if (count($linhasPendentes) === LINHAS_POR_INSERT) {
                    fwrite($arquivo, "INSERT INTO {$nomeProtegido} ({$colunas}) VALUES\n" . implode(",\n", $linhasPendentes) . ";\n");
                    $linhasPendentes = [];
                }
            }
            if ($linhasPendentes !== []) {
                fwrite($arquivo, "INSERT INTO {$nomeProtegido} ({$colunas}) VALUES\n" . implode(",\n", $linhasPendentes) . ";\n");
            }
            fwrite($arquivo, "\n");
        }
        fwrite($arquivo, "SET FOREIGN_KEY_CHECKS = 1;\n");
    } finally {
        fclose($arquivo);
    }
}

/** Monta o .zip completo (banco + fotos + instruções) no caminho indicado. */
function gerarBackupCompleto(string $caminhoZip): void
{
    if (!class_exists(ZipArchive::class)) {
        throw new RuntimeException('A extensão "zip" do PHP não está ativa no servidor.');
    }
    $arquivoSqlTemporario = tempnam(sys_get_temp_dir(), 'vivale-sql-');
    try {
        gravarCopiaDoBanco($arquivoSqlTemporario);

        $zip = new ZipArchive();
        if ($zip->open($caminhoZip, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new RuntimeException('Não foi possível criar o arquivo de backup.');
        }
        $zip->addFile($arquivoSqlTemporario, 'banco.sql');
        $zip->addFromString('LEIA-ME.txt', INSTRUCOES_DE_RESTAURACAO . "\n");

        $pastaUploads = obterConfiguracao()['pasta_uploads'];
        foreach (glob($pastaUploads . '/*') ?: [] as $caminhoFoto) {
            $nomeFoto = basename($caminhoFoto);
            if (is_file($caminhoFoto) && preg_match(PADRAO_NOME_DE_FOTO, $nomeFoto) === 1) {
                // Fotos já são comprimidas: guardar sem recomprimir é mais rápido e quase não aumenta o arquivo
                $zip->addFile($caminhoFoto, 'fotos/' . $nomeFoto);
                $zip->setCompressionName('fotos/' . $nomeFoto, ZipArchive::CM_STORE);
            }
        }
        if (!$zip->close()) {
            throw new RuntimeException('Não foi possível terminar o arquivo de backup.');
        }
    } finally {
        @unlink($arquivoSqlTemporario);
    }
}

/** Nome do arquivo com data e hora, para não confundir uma cópia com outra. */
function nomeDoArquivoDeBackup(): string
{
    return 'vivale-backup-' . agoraNoFusoDaLoja()->format('Y-m-d-His') . '.zip';
}

/** Guarda só os backups automáticos mais recentes, para não encher o disco. */
function apagarBackupsAntigos(string $pastaBackups): void
{
    $backups = glob($pastaBackups . '/vivale-backup-*.zip') ?: [];
    // O nome começa pela data, então a ordem alfabética é a ordem do mais antigo ao mais novo
    sort($backups);
    foreach (array_slice($backups, 0, max(0, count($backups) - BACKUPS_AUTOMATICOS_GUARDADOS)) as $backupAntigo) {
        unlink($backupAntigo);
    }
}

/** Datas do último backup baixado pelo dono e do último automático (ou null). */
function obterSituacaoDosBackups(): array
{
    $linhas = executarConsulta(
        "SELECT chave, valor FROM configuracoes WHERE chave IN ('ultimoBackupBaixado', 'ultimoBackupAutomatico')",
    )->fetchAll(PDO::FETCH_KEY_PAIR);
    return [
        'ultimoBaixado' => isset($linhas['ultimoBackupBaixado']) ? json_decode($linhas['ultimoBackupBaixado']) : null,
        'ultimoAutomatico' => isset($linhas['ultimoBackupAutomatico']) ? json_decode($linhas['ultimoBackupAutomatico']) : null,
    ];
}

/** Anota quando foi feito o backup (data no formato ISO, com fuso). */
function registrarDataDoBackup(string $chave): void
{
    executarConsulta(
        'INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)',
        [$chave, json_encode(agoraNoFusoDaLoja()->format(DATE_ATOM))],
    );
}
