-- Blindagem do plano no cadastro (14/nov/2026)
-- Achado: a regra de INSERT em "usuarios" só conferia o id. Uma pessoa
-- esperta podia criar a própria linha já com um plano pago, sem pagar.
-- O app sempre cria com plano 'gratis', então nada muda pra quem usa normal.
-- Também tira o DELETE direto da tabela: excluir conta já é feito pelo
-- servidor (Privacidade e dados), com conferência de senha.
-- Pode rodar a qualquer hora (não depende de merge).

drop policy if exists usuarios_insert_own on public.usuarios;
create policy usuarios_insert_own on public.usuarios
  for insert to authenticated
  with check (id = auth.uid() and plano = 'gratis');

drop policy if exists usuarios_delete_own on public.usuarios;
