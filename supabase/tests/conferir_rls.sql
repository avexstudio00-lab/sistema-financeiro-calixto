-- =====================================================================
-- Rotina mensal 3.5: o banco continua IGUAL ao que está versionado?
--
-- 1) Assinatura (md5) de todas as políticas de public + storage — as que
--    estão em supabase/migrations/20261011000000_rls_snapshot.sql e nas
--    migrações seguintes.
--
--   Assinatura esperada (11/out/2026): f9e81351b5d000423f60f1b866a637ed  (59 políticas)
--
-- Se bater: nada foi mexido direto no painel. Se não bater: alguém mudou
-- política fora do repositório — descubra qual (compare com as migrações),
-- crie um arquivo novo em supabase/migrations/ com a mudança e atualize a
-- assinatura esperada acima no mesmo commit.
-- =====================================================================
select count(*) as politicas,
       md5(string_agg(format('%s|%s|%s|%s|%s|%s|%s', schemaname, tablename, policyname,
           permissive, cmd, array_to_string(roles, ','),
           coalesce(qual, '') || '#' || coalesce(with_check, '')),
           E'\n' order by schemaname, tablename, policyname)) as assinatura
  from pg_policies
 where schemaname in ('public', 'storage');

-- 2) Tabelas do schema public com RLS DESLIGADO (tem que vir vazio):
select c.relname as tabela_sem_rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
