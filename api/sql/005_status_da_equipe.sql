-- Status de cada pessoa da equipe no painel (online, pausa, ausente, offline). Importe depois do 004.
-- Pode ser importado com a loja no ar: só acrescenta colunas.
--   status       → o que a pessoa escolheu (ou "ausente", que o painel põe sozinho após 10 min parado)
--   status_desde → desde quando está nesse status
--   visto_em     → último sinal do painel aberto; sem sinal há 10 min, a pessoa aparece como offline
ALTER TABLE usuarios
  ADD COLUMN status VARCHAR(10) NOT NULL DEFAULT 'offline' AFTER ativo,
  ADD COLUMN status_desde DATETIME NULL AFTER status,
  ADD COLUMN visto_em DATETIME NULL AFTER status_desde;
