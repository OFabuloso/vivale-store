-- Estoque por tamanho e cor, pedidos do site e vendas no balcão. Importe pelo phpMyAdmin depois do 003.
-- Pode ser importado com a loja no ar: só acrescenta colunas e tabelas. Os produtos atuais ficam
-- sem controle de estoque (a loja continua igual) até o dono ligar, produto a produto.

-- Liga o controle por produto e define a partir de quantas peças o painel avisa
ALTER TABLE produtos
  ADD COLUMN controla_estoque TINYINT(1) NOT NULL DEFAULT 0 AFTER ativo,
  ADD COLUMN alerta_estoque INT UNSIGNED NOT NULL DEFAULT 3 AFTER controla_estoque;

-- Quantidade de cada variação (tamanho + cor). Variação sem linha conta como zero.
CREATE TABLE estoque (
  produto_id VARCHAR(64) NOT NULL,
  tamanho VARCHAR(10) NOT NULL,
  cor VARCHAR(40) NOT NULL,
  quantidade INT NOT NULL DEFAULT 0,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (produto_id, tamanho, cor),
  CONSTRAINT fk_estoque_produto FOREIGN KEY (produto_id) REFERENCES produtos (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Histórico de toda entrada e saída: ajuste no painel, venda e cancelamento de venda
CREATE TABLE movimentos_estoque (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  produto_id VARCHAR(64) NOT NULL,
  tamanho VARCHAR(10) NOT NULL,
  cor VARCHAR(40) NOT NULL,
  variacao INT NOT NULL,
  quantidade_final INT NOT NULL,
  motivo VARCHAR(20) NOT NULL,
  pedido_id INT UNSIGNED NULL,
  usuario_id INT UNSIGNED NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_movimentos_produto (produto_id),
  KEY idx_movimentos_pedido (pedido_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pedidos: os que a cliente manda pelo site (começam pendentes) e as vendas no balcão
CREATE TABLE pedidos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  origem VARCHAR(10) NOT NULL,
  situacao VARCHAR(10) NOT NULL DEFAULT 'pendente',
  forma_pagamento VARCHAR(10) NULL,
  total DECIMAL(10,2) NOT NULL,
  observacoes TEXT NULL,
  contato_nome VARCHAR(80) NULL,
  ip VARCHAR(45) NULL,
  criado_por INT UNSIGNED NULL,
  finalizado_por INT UNSIGNED NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finalizado_em DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_pedidos_situacao (situacao, criado_em),
  KEY idx_pedidos_ip (ip, criado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Itens com nome e preço copiados no momento do pedido (o histórico não muda se o produto mudar)
CREATE TABLE pedido_itens (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  pedido_id INT UNSIGNED NOT NULL,
  produto_id VARCHAR(64) NOT NULL,
  nome VARCHAR(150) NOT NULL,
  tamanho VARCHAR(10) NOT NULL,
  cor VARCHAR(40) NOT NULL,
  quantidade INT UNSIGNED NOT NULL,
  preco_unitario DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_itens_pedido (pedido_id),
  CONSTRAINT fk_itens_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
