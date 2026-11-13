-- 14/nov/2026 — PR31: blindagem do que o funcionário não precisa ver.
-- Rodar DEPOIS de 20261113000000 (#29) e 20261114000000 (#30).
--
-- Regras:
--  * Custo é só do dono e do sócio: produtos.custo, servicos.custo,
--    vendas.custo_unitario e vendas.taxa_maquininha deixam de ser legíveis
--    direto; dono/sócio recebem pelas funções custos_* (que conferem o papel).
--  * Funcionário vê só as vendas que ele mesmo lançou.
--  * Carteiras: ninguém convidado vê as carteiras PESSOAIS do dono (antes o
--    sócio e o funcionário enxergavam todas). Sócio vê as da empresa;
--    funcionário não vê nenhuma (nem saldo) — recebe só os nomes pra escolher
--    na venda (carteiras_para_venda) e o banco atualiza o saldo sozinho.
--  * Vendedores (comissão/meta dos outros): só dono e sócio.
--
-- ATENÇÃO pra migrações futuras: coluna nova em produtos/servicos/vendas
-- precisa de "grant select (coluna) on ... to authenticated" (e entrar em
-- src/lib/data/colunas.ts), senão o app não consegue ler.

alter table public.vendas add column if not exists vendedor_id uuid default auth.uid();
alter table public.transacoes add column if not exists criado_por uuid default auth.uid();

-- 1) Custos: leitura por coluna --------------------------------------------
do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'produtos' and column_name <> 'custo';
  execute 'revoke select on public.produtos from anon, authenticated';
  execute format('grant select (%s) on public.produtos to authenticated', cols);

  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'servicos' and column_name <> 'custo';
  execute 'revoke select on public.servicos from anon, authenticated';
  execute format('grant select (%s) on public.servicos to authenticated', cols);

  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'vendas' and column_name not in ('custo_unitario', 'taxa_maquininha');
  execute 'revoke select on public.vendas from anon, authenticated';
  execute format('grant select (%s) on public.vendas to authenticated', cols);
end $$;

create or replace function public.custos_produtos(p_ids uuid[])
returns table (id uuid, custo numeric)
language sql stable security definer set search_path = public as $$
  select p.id, p.custo from public.produtos p
   where p.id = any(p_ids)
     and p.usuario_id = conta_mestre_do_usuario(auth.uid())
     and empresa_acessivel(p.empresa_id)
     and papel_do_membro() <> 'funcionario';
$$;

create or replace function public.custos_servicos(p_ids uuid[])
returns table (id uuid, custo numeric)
language sql stable security definer set search_path = public as $$
  select s.id, s.custo from public.servicos s
   where s.id = any(p_ids)
     and s.usuario_id = conta_mestre_do_usuario(auth.uid())
     and empresa_acessivel(s.empresa_id)
     and papel_do_membro() <> 'funcionario';
$$;

create or replace function public.custos_vendas(p_ids uuid[])
returns table (id uuid, custo_unitario numeric, taxa_maquininha numeric)
language sql stable security definer set search_path = public as $$
  select v.id, v.custo_unitario, v.taxa_maquininha from public.vendas v
   where v.id = any(p_ids)
     and v.usuario_id = conta_mestre_do_usuario(auth.uid())
     and empresa_acessivel(v.empresa_id)
     and papel_do_membro() <> 'funcionario';
$$;

revoke execute on function public.custos_produtos(uuid[]) from public, anon;
revoke execute on function public.custos_servicos(uuid[]) from public, anon;
revoke execute on function public.custos_vendas(uuid[]) from public, anon;
grant execute on function public.custos_produtos(uuid[]) to authenticated;
grant execute on function public.custos_servicos(uuid[]) to authenticated;
grant execute on function public.custos_vendas(uuid[]) to authenticated;

-- Funcionário não grava nem muda custo: na venda o banco preenche o custo
-- certo da peça/serviço; no cadastro o custo continua o que o dono pôs.
create or replace function public.protege_custo_venda_funcionario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if papel_do_membro() <> 'funcionario' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.custo_unitario := coalesce(
      (select p.custo from public.produtos p where p.id = new.produto_id),
      (select s.custo from public.servicos s where s.id = new.servico_id),
      0);
  else
    new.custo_unitario := old.custo_unitario;
    new.taxa_maquininha := old.taxa_maquininha;
  end if;
  return new;
end $$;

create or replace function public.protege_custo_cadastro_funcionario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if papel_do_membro() <> 'funcionario' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.custo := 0;
  else
    new.custo := old.custo;
  end if;
  return new;
end $$;

drop trigger if exists trg_protege_custo_funcionario on public.vendas;
create trigger trg_protege_custo_funcionario before insert or update on public.vendas
  for each row execute function public.protege_custo_venda_funcionario();
drop trigger if exists trg_protege_custo_funcionario on public.produtos;
create trigger trg_protege_custo_funcionario before insert or update on public.produtos
  for each row execute function public.protege_custo_cadastro_funcionario();
drop trigger if exists trg_protege_custo_funcionario on public.servicos;
create trigger trg_protege_custo_funcionario before insert or update on public.servicos
  for each row execute function public.protege_custo_cadastro_funcionario();

-- 2) Vendas: funcionário só as dele ------------------------------------------
drop policy if exists vendas_all on public.vendas;
drop policy if exists vendas_select on public.vendas;
drop policy if exists vendas_insert on public.vendas;
drop policy if exists vendas_update on public.vendas;
drop policy if exists vendas_delete on public.vendas;

create policy vendas_select on public.vendas as permissive for select to authenticated
  using (usuario_id = conta_mestre_do_usuario(auth.uid()) and empresa_acessivel(empresa_id)
         and (papel_do_membro() <> 'funcionario' or vendedor_id = auth.uid()));
create policy vendas_insert on public.vendas as permissive for insert to authenticated
  with check (usuario_id = conta_mestre_do_usuario(auth.uid()) and empresa_acessivel(empresa_id)
              and (papel_do_membro() <> 'funcionario' or vendedor_id = auth.uid()));
create policy vendas_update on public.vendas as permissive for update to authenticated
  using (usuario_id = conta_mestre_do_usuario(auth.uid()) and empresa_acessivel(empresa_id)
         and (papel_do_membro() <> 'funcionario' or vendedor_id = auth.uid()))
  with check (usuario_id = conta_mestre_do_usuario(auth.uid()) and empresa_acessivel(empresa_id)
              and (papel_do_membro() <> 'funcionario' or vendedor_id = auth.uid()));
create policy vendas_delete on public.vendas as permissive for delete to authenticated
  using (usuario_id = conta_mestre_do_usuario(auth.uid()) and empresa_acessivel(empresa_id)
         and (papel_do_membro() <> 'funcionario' or vendedor_id = auth.uid()));

-- 3) Carteiras ---------------------------------------------------------------
drop policy if exists contas_select on public.contas;
drop policy if exists contas_insert on public.contas;
drop policy if exists contas_update on public.contas;
drop policy if exists contas_delete on public.contas;

create policy contas_select on public.contas as permissive for select to public
  using (usuario_id = auth.uid()
         or (usuario_id = conta_mestre_do_usuario(auth.uid()) and ambiente = 'empresa' and papel_do_membro() <> 'funcionario'));
create policy contas_insert on public.contas as permissive for insert to public
  with check (usuario_id = auth.uid()
              or (usuario_id = conta_mestre_do_usuario(auth.uid()) and ambiente = 'empresa' and papel_do_membro() <> 'funcionario'));
create policy contas_update on public.contas as permissive for update to public
  using (usuario_id = auth.uid()
         or (usuario_id = conta_mestre_do_usuario(auth.uid()) and ambiente = 'empresa' and papel_do_membro() <> 'funcionario'))
  with check (usuario_id = auth.uid()
              or (usuario_id = conta_mestre_do_usuario(auth.uid()) and ambiente = 'empresa' and papel_do_membro() <> 'funcionario'));
create policy contas_delete on public.contas as permissive for delete to public
  using (usuario_id = auth.uid()
         or (usuario_id = conta_mestre_do_usuario(auth.uid()) and ambiente = 'empresa' and papel_do_membro() <> 'funcionario'));

-- Nomes das carteiras da empresa pra escolher na venda (sem saldo).
create or replace function public.carteiras_para_venda()
returns table (id uuid, nome text, tipo text)
language sql stable security definer set search_path = public as $$
  select c.id, c.nome, c.tipo from public.contas c
   where c.usuario_id = conta_mestre_do_usuario(auth.uid())
     and c.ambiente = 'empresa'
     and c.tipo <> 'cartao_credito'
   order by c.criado_em;
$$;
revoke execute on function public.carteiras_para_venda() from public, anon;
grant execute on function public.carteiras_para_venda() to authenticated;

-- Venda/entrada lançada pelo funcionário: o banco soma no saldo da carteira
-- da empresa (ele não lê nem altera a carteira direto).
create or replace function public.saldo_pela_transacao_funcionario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if papel_do_membro() = 'funcionario' and new.tipo_negocio = 'negocio' and new.conta_id is not null then
    update public.contas
       set saldo_atual = saldo_atual + case when new.tipo = 'receita' then new.valor else -new.valor end
     where id = new.conta_id and usuario_id = new.usuario_id and ambiente = 'empresa';
  end if;
  return new;
end $$;

drop trigger if exists trg_saldo_transacao_funcionario on public.transacoes;
create trigger trg_saldo_transacao_funcionario after insert on public.transacoes
  for each row execute function public.saldo_pela_transacao_funcionario();

-- O funcionário lê de volta só os lançamentos que ele mesmo criou (o app
-- precisa do id pra ligar a venda ao lançamento).
drop policy if exists transacoes_select on public.transacoes;
create policy transacoes_select on public.transacoes as permissive for select to public
  using (
    usuario_id = auth.uid()
    or (
      tipo_negocio = 'negocio'
      and usuario_id = conta_mestre_do_usuario(auth.uid())
      and (empresa_id is null or empresa_acessivel(empresa_id))
      and (papel_do_membro() <> 'funcionario' or criado_por = auth.uid())
    )
  );

-- 4) Vendedores: comissão e meta dos outros só pra dono/sócio ---------------
drop policy if exists vendedores_select on public.vendedores;
create policy vendedores_select on public.vendedores as permissive for select to authenticated
  using (usuario_id = conta_mestre_do_usuario(auth.uid()) and empresa_acessivel(empresa_id) and papel_do_membro() <> 'funcionario');
