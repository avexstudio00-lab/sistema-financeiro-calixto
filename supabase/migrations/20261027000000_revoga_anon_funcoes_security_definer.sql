-- 27/out/2026 — Advisor 0028 do Supabase: funções SECURITY DEFINER executáveis sem login.
-- JÁ APLICADO na produção (wtkwsyvjtnxpoopdniwq) e no staging (nrmytoerrwqsgmbertoh) em 27/out/2026.
-- Testado no staging antes: RLS A x B OK em 32 tabelas, anônimo OK; dono enxerga exatamente os próprios dados.
--
-- aceitar_convite: já exigia login (auth.jwt email); a tela /convite só chama logada.
-- empresa_acessivel: usada só dentro das políticas de RLS; anônimo nunca acessa dados de empresa
--   (agora recebe "permission denied" em vez de lista vazia, igual às outras tabelas que usam conta_mestre_do_usuario).
-- consultar_convite continua liberada para anônimo DE PROPÓSITO (tela /convite antes do login; token de 128 bits aleatórios).
-- Políticas (pg_policies) não mudaram: a assinatura em supabase/tests/conferir_rls.sql continua válida.
--
-- Para desfazer:
--   grant execute on function public.aceitar_convite(text) to anon;
--   grant execute on function public.empresa_acessivel(uuid) to anon;

revoke execute on function public.aceitar_convite(text) from public, anon;
revoke execute on function public.empresa_acessivel(uuid) from public, anon;
grant execute on function public.aceitar_convite(text) to authenticated, service_role;
grant execute on function public.empresa_acessivel(uuid) to authenticated, service_role;
