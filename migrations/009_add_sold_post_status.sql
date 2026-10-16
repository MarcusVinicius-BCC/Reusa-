ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_status_check;

ALTER TABLE posts
  ADD CONSTRAINT posts_status_check
  CHECK (status IN ('Disponível', 'Reservado', 'Doado', 'Trocado', 'Vendido', 'Encerrado'));
