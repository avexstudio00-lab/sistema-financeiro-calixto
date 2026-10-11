-- =====================================================================
-- Teste automatizado de ACESSO CRUZADO (item 1 da apuração de segurança)
--
-- Prova que o usuário A NÃO consegue ler, alterar nem apagar dado do
-- usuário B — direto no Postgres, com o mesmo papel ("authenticated") e o
-- mesmo JWT que o app usa. Não depende da tela.
--
-- Seguro em produção: tudo roda dentro de uma transação que termina em
-- ROLLBACK. Nenhuma linha é criada, alterada ou apagada de verdade.
-- Não lê conteúdo de ninguém: só CONTA linhas.
--
-- Qualquer falha dispara RAISE EXCEPTION (o psql sai com erro e o
-- pipeline fica vermelho). Sucesso termina com o aviso "RLS OK".
--
-- Como rodar: SQL Editor do Supabase (colar tudo) ou
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_acesso_cruzado.sql
-- =====================================================================
begin;

-- 1) Escolhe A e B (como superusuário, antes de virar "authenticated"):
--    duas contas reais SEM vínculo de membro entre si.
do $$
declare a uuid; b uuid;
begin
  select u.id into a from public.usuarios u order by u.data_criacao limit 1;
  select u.id into b from public.usuarios u
   where u.id <> a
     and not exists (select 1 from public.membros m
                      where (m.conta_mestre_id = a and m.membro_usuario_id = u.id)
                         or (m.conta_mestre_id = u.id and m.membro_usuario_id = a))
   order by u.data_criacao limit 1;
  if a is null or b is null then
    raise exception 'Teste precisa de pelo menos 2 contas sem vínculo entre si.';
  end if;
  perform set_config('teste.usuario_a', a::text, true);
  perform set_config('teste.usuario_b', b::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal2')::text, true);
end $$;

-- 2) Daqui em diante, tudo roda como o usuário A logado.
set local role authenticated;

do $$
declare
  a uuid := current_setting('teste.usuario_a')::uuid;
  b uuid := current_setting('teste.usuario_b')::uuid;
  t record;
  vistos bigint;
  afetados bigint;
  falhas text := '';
  tabelas int := 0;
begin
  if auth.uid() is distinct from a then
    raise exception 'Simulação de login falhou (auth.uid() = %).', auth.uid();
  end if;

  -- Toda tabela do schema public que tem dono (usuario_id ou user_id).
  for t in
    select c.table_name, c.column_name
      from information_schema.columns c
      join information_schema.tables tb
        on tb.table_schema = c.table_schema and tb.table_name = c.table_name
     where c.table_schema = 'public'
       and tb.table_type = 'BASE TABLE'
       and c.column_name in ('usuario_id', 'user_id')
     order by c.table_name
  loop
    tabelas := tabelas + 1;

    -- LER: A não pode enxergar nenhuma linha de B.
    begin
      execute format('select count(*) from public.%I where %I = $1', t.table_name, t.column_name)
        into vistos using b;
    exception when insufficient_privilege then vistos := 0;  -- sem GRANT = bloqueado também
    end;
    if vistos > 0 then
      falhas := falhas || format(E'\n  LEU %s linha(s) de B em %s', vistos, t.table_name);
    end if;

    -- ALTERAR: update nas linhas de B tem que afetar 0 linhas.
    begin
      execute format('update public.%I set %I = %I where %I = $1',
                     t.table_name, t.column_name, t.column_name, t.column_name) using b;
      get diagnostics afetados = row_count;
    exception when insufficient_privilege then afetados := 0;
    end;
    if afetados > 0 then
      falhas := falhas || format(E'\n  ALTEROU %s linha(s) de B em %s', afetados, t.table_name);
    end if;

    -- APAGAR: delete nas linhas de B tem que afetar 0 linhas.
    begin
      execute format('delete from public.%I where %I = $1', t.table_name, t.column_name) using b;
      get diagnostics afetados = row_count;
    exception
      when insufficient_privilege then afetados := 0;
      when foreign_key_violation then afetados := 1;  -- chegou a tentar apagar = enxergou
    end;
    if afetados > 0 then
      falhas := falhas || format(E'\n  APAGOU %s linha(s) de B em %s', afetados, t.table_name);
    end if;
  end loop;

  -- CRIAR em nome de B: inserir uma meta com usuario_id = B tem que falhar.
  begin
    insert into public.metas (usuario_id, nome, valor_meta)
    values (b, 'teste rls - nunca deveria existir', 1);
    falhas := falhas || E'\n  CRIOU meta em nome de B';
  exception
    when insufficient_privilege then null;   -- bloqueado pelo RLS (esperado)
    when others then
      if sqlerrm not like '%row-level security%' then
        falhas := falhas || format(E'\n  insert em metas falhou por outro motivo: %s', sqlerrm);
      end if;
  end;

  if falhas <> '' then
    raise exception 'RLS FALHOU:%', falhas;
  end if;
  raise notice 'RLS OK (usuário A x B): % tabelas testadas, nenhum acesso cruzado (ler/alterar/apagar/criar).', tabelas;
end $$;

-- 3) Sem login (anon): nenhuma tabela com dono pode devolver linha.
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

do $$
declare t record; vistos bigint; falhas text := '';
begin
  for t in
    select distinct c.table_name, c.column_name
      from information_schema.columns c
      join information_schema.tables tb
        on tb.table_schema = c.table_schema and tb.table_name = c.table_name
     where c.table_schema = 'public' and tb.table_type = 'BASE TABLE'
       and c.column_name in ('usuario_id', 'user_id')
  loop
    begin
      execute format('select count(*) from public.%I where %I is not null', t.table_name, t.column_name)
        into vistos;
    exception when insufficient_privilege then vistos := 0;
    end;
    if vistos > 0 then
      falhas := falhas || format(E'\n  ANÔNIMO leu %s linha(s) em %s', vistos, t.table_name);
    end if;
  end loop;
  if falhas <> '' then
    raise exception 'RLS FALHOU (anônimo):%', falhas;
  end if;
  raise notice 'RLS OK (anônimo): nenhuma linha com dono visível sem login.';
end $$;

rollback;
