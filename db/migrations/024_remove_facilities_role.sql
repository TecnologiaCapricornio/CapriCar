BEGIN;

-- O papel "facilities" nunca concedia nada por si só - todo acesso já vinha
-- das colunas can_manage_* (independentes do role), então uma conta
-- facilities e uma conta "user" com as mesmas permissões marcadas sempre se
-- comportaram de forma idêntica. Essas permissões continuam exatamente como
-- estão nesta troca; só o rótulo de papel especial sai de cena - dali em
-- diante, esse acesso se atribui a qualquer usuário do jeito normal, pelas
-- caixinhas de permissão do Painel de Administração > Usuários.
UPDATE users SET role = 'user' WHERE role = 'facilities';

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'user'));

COMMIT;
