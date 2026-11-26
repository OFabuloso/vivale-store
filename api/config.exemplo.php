<?php
/**
 * Modelo da configuração secreta do backend.
 *
 * No servidor, copie este conteúdo para um arquivo FORA da public_html:
 *   /home/u151095779/domains/vivalestore.com.br/config/vivale.php
 * e troque os valores pelos dados do banco criado no hPanel.
 * Nunca coloque o arquivo com as senhas reais no Git.
 */
return [
    'banco' => [
        'servidor' => 'localhost',
        'nome' => 'u151095779_vivale',
        'usuario' => 'u151095779_vivale',
        'senha' => 'TROQUE_PELA_SENHA_DO_BANCO',
    ],
    // Pasta das fotos enviadas pelo painel (também fora da public_html)
    'pasta_uploads' => '/home/u151095779/domains/vivalestore.com.br/uploads',
    // Chave que protege o segredo do 2FA no banco (32 bytes em base64). Gere uma só vez com:
    //   php -r "echo base64_encode(random_bytes(32)), PHP_EOL;"
    // Se for trocada, quem usa 2FA precisa ativá-lo de novo.
    'chave_criptografia' => 'COLE_A_CHAVE_GERADA_AQUI',
    // true só no ambiente local (Docker): aceita o cookie de sessão sem HTTPS
    'ambiente_local' => false,
];
