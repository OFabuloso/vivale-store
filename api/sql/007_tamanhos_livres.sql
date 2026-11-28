-- Tamanhos livres digitados no painel ("Veste até 42", "Veste do 42 ao 49"). Importe depois do 006.
-- Pode ser importado com a loja no ar: só aumenta o limite do texto do tamanho (de 10 para 30 letras).
ALTER TABLE estoque MODIFY tamanho VARCHAR(30) NOT NULL;
ALTER TABLE movimentos_estoque MODIFY tamanho VARCHAR(30) NOT NULL;
ALTER TABLE pedido_itens MODIFY tamanho VARCHAR(30) NOT NULL;
