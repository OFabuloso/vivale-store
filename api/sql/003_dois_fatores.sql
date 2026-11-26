-- Verificação em duas etapas (2FA) do painel. Importe pelo phpMyAdmin depois do 002.
-- Pode ser importado com a loja no ar: só acrescenta colunas e uma tabela, sem mexer nos dados.

-- Segredo do app autenticador (criptografado; vazio = 2FA desligado) e o último código usado,
-- para que o mesmo código não sirva duas vezes
ALTER TABLE usuarios
  ADD COLUMN totp_segredo VARCHAR(255) NULL AFTER senha_hash,
  ADD COLUMN totp_ultimo_passo BIGINT NULL AFTER totp_segredo;

-- Códigos de recuperação (para quem perdeu o celular). Cada um vale uma vez; só o hash fica guardado.
CREATE TABLE codigos_recuperacao (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id INT UNSIGNED NOT NULL,
  codigo_hash VARCHAR(255) NOT NULL,
  usado_em DATETIME NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_codigos_usuario (usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
