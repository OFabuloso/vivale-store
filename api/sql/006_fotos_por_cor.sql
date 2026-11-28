-- Foto de cada cor do produto. Importe depois do 005.
-- Pode ser importado com a loja no ar: só acrescenta uma coluna.
--   fotos_por_cor → JSON {"Pink": "fotos/....jpg", "Preto": "fotos/....jpg"}; a cor sem foto própria usa a coluna "foto"
ALTER TABLE produtos
  ADD COLUMN fotos_por_cor TEXT NULL AFTER foto;
