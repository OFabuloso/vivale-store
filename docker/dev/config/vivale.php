<?php
// Configuração do ambiente local (Docker). As senhas aqui são só de teste.
return [
    'banco' => [
        'servidor' => 'banco',
        'nome' => 'vivale',
        'usuario' => 'vivale',
        'senha' => 'vivale-local',
    ],
    'pasta_uploads' => '/home/u151095779/domains/vivalestore.com.br/uploads',
    // Chave de teste do 2FA (a de produção é outra, só no servidor)
    'chave_criptografia' => 'kyKm/tdFAjjSvREbLMvh8/5DmRwINNp2kHwIj+T5y+M=',
    'ambiente_local' => true,
];
