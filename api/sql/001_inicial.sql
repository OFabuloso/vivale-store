-- Esquema do banco da Vivale Store (MySQL 8 / MariaDB 10.6+).
-- Importe este arquivo pelo phpMyAdmin antes do 002_catalogo_inicial.sql.
-- Listas (tamanhos, cores, detalhes) são guardadas como texto JSON, que funciona nos dois bancos.

SET NAMES utf8mb4;

-- Quem pode entrar no painel. "papel" já prepara a etapa das atendentes.
CREATE TABLE usuarios (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario VARCHAR(40) NOT NULL,
  nome VARCHAR(80) NOT NULL,
  senha_hash VARCHAR(255) NOT NULL,
  papel VARCHAR(20) NOT NULL DEFAULT 'dono',
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  ultimo_acesso DATETIME NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY usuario_unico (usuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE produtos (
  id VARCHAR(64) NOT NULL,
  nome VARCHAR(150) NOT NULL,
  descricao TEXT NOT NULL,
  categoria VARCHAR(60) NOT NULL,
  preco DECIMAL(10, 2) NOT NULL,
  foto VARCHAR(255) NOT NULL DEFAULT '',
  tamanhos TEXT NOT NULL,
  cores TEXT NOT NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  ordem INT NOT NULL DEFAULT 0,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY produtos_ordem (ordem)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Contatos de WhatsApp; os desligados (ativo = 0) não aparecem para a cliente.
CREATE TABLE contatos (
  id VARCHAR(64) NOT NULL,
  nome VARCHAR(40) NOT NULL,
  numero VARCHAR(13) NOT NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  ordem INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY contato_numero_unico (numero)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Configurações simples da loja (ex.: valorMinimo), com o valor em JSON.
CREATE TABLE configuracoes (
  chave VARCHAR(40) NOT NULL,
  valor TEXT NOT NULL,
  PRIMARY KEY (chave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tentativas de login com erro, usadas para bloquear quem tenta adivinhar a senha.
CREATE TABLE tentativas_login (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ip VARCHAR(45) NOT NULL,
  usuario VARCHAR(40) NOT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY tentativas_por_ip (ip, criado_em),
  KEY tentativas_por_usuario (usuario, criado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Registro de quem fez o quê no painel.
CREATE TABLE auditoria (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id INT UNSIGNED NULL,
  acao VARCHAR(40) NOT NULL,
  detalhes TEXT NOT NULL,
  ip VARCHAR(45) NOT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY auditoria_data (criado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
