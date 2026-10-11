-- =====================================================================
-- RLS versionado no repositório (item 1 da apuração de segurança, 10/out/2026)
--
-- Fotografia EXATA das políticas aplicadas no banco de produção
-- (projeto wtkwsyvjtnxpoopdniwq) em 11/out/2026, extraída de pg_policies /
-- pg_get_functiondef. 37 tabelas no schema public, todas com RLS ligado;
-- 53 políticas em public + 6 em storage.objects.
--
-- REGRA: nenhuma política é mais alterada direto no painel do Supabase.
-- Toda mudança vira um arquivo novo nesta pasta (AAAAMMDDHHMMSS_nome.sql),
-- aplicado no SQL Editor, e a rotina mensal 3.5 confere se o banco
-- continua idêntico a esta pasta (ver supabase/tests/conferir_rls.sql).
--
-- Idempotente: pode ser rodado de novo sem efeito colateral.
-- Tabelas sem nenhuma política (asaas_webhook_events, cotacoes_mercado,
-- eventos_seguranca, limite_requisicoes, notificacoes_enviadas,
-- webauthn_challenges) são de propósito: RLS ligado + zero políticas =
-- só a service role (servidor) acessa.
-- =====================================================================

-- ---------- Funções auxiliares usadas pelas políticas ----------

CREATE OR REPLACE FUNCTION public.conta_mestre_do_usuario(p_usuario_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select conta_mestre_id from public.membros
       where membro_usuario_id = auth.uid() and status = 'ativo'
       limit 1),
    auth.uid()
  );
$function$;

CREATE OR REPLACE FUNCTION public.empresa_acessivel(p_empresa_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.empresas e
    where e.id = p_empresa_id
      and e.usuario_id = conta_mestre_do_usuario(auth.uid())
  )
  and (
    conta_mestre_do_usuario(auth.uid()) = auth.uid()
    or exists (
      select 1 from public.membros m
      where m.membro_usuario_id = auth.uid()
        and m.status = 'ativo'
        and (m.empresa_id is null or m.empresa_id = p_empresa_id)
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.papel_do_membro()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select papel from public.membros where membro_usuario_id = auth.uid() and status = 'ativo' limit 1),
    'dono'
  );
$function$;

-- ---------- RLS ligado em todas as tabelas ----------

alter table public.analises_ia enable row level security;
alter table public.asaas_webhook_events enable row level security;
alter table public.assinaturas enable row level security;
alter table public.categorias enable row level security;
alter table public.clientes enable row level security;
alter table public.config_negocio enable row level security;
alter table public.contas enable row level security;
alter table public.contas_fixas enable row level security;
alter table public.contas_pagar enable row level security;
alter table public.contas_receber enable row level security;
alter table public.cotacoes_mercado enable row level security;
alter table public.divida_parcelas enable row level security;
alter table public.dividas enable row level security;
alter table public.empresas enable row level security;
alter table public.eventos_seguranca enable row level security;
alter table public.fornecedores enable row level security;
alter table public.investimento_pagamentos enable row level security;
alter table public.investimento_parcelas enable row level security;
alter table public.investimentos enable row level security;
alter table public.limite_requisicoes enable row level security;
alter table public.limites_categoria enable row level security;
alter table public.membros enable row level security;
alter table public.metas enable row level security;
alter table public.modelos_lancamento enable row level security;
alter table public.notas_fiscais enable row level security;
alter table public.notificacoes_enviadas enable row level security;
alter table public.orcamentos enable row level security;
alter table public.preferencias_privacidade enable row level security;
alter table public.produtos enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.servicos enable row level security;
alter table public.transacoes enable row level security;
alter table public.user_authenticators enable row level security;
alter table public.user_consents enable row level security;
alter table public.usuarios enable row level security;
alter table public.vendas enable row level security;
alter table public.webauthn_challenges enable row level security;

-- ---------- Políticas (schema public) ----------

drop policy if exists analises_all_own on public.analises_ia;
create policy analises_all_own on public.analises_ia as PERMISSIVE for ALL to public
  using ((usuario_id = auth.uid()))
  with check ((usuario_id = auth.uid()));

drop policy if exists assinaturas_delete_own on public.assinaturas;
create policy assinaturas_delete_own on public.assinaturas as PERMISSIVE for DELETE to public
  using ((usuario_id = auth.uid()));

drop policy if exists assinaturas_insert_own on public.assinaturas;
create policy assinaturas_insert_own on public.assinaturas as PERMISSIVE for INSERT to public
  with check (((usuario_id = auth.uid()) AND (status <> 'ativa'::text)));

drop policy if exists assinaturas_select_mestre on public.assinaturas;
create policy assinaturas_select_mestre on public.assinaturas as PERMISSIVE for SELECT to public
  using ((usuario_id = conta_mestre_do_usuario(auth.uid())));

drop policy if exists assinaturas_select_own on public.assinaturas;
create policy assinaturas_select_own on public.assinaturas as PERMISSIVE for SELECT to public
  using ((usuario_id = auth.uid()));

drop policy if exists assinaturas_update_own on public.assinaturas;
create policy assinaturas_update_own on public.assinaturas as PERMISSIVE for UPDATE to public
  using ((usuario_id = auth.uid()))
  with check (((usuario_id = auth.uid()) AND (status <> 'ativa'::text)));

drop policy if exists categorias_delete on public.categorias;
create policy categorias_delete on public.categorias as PERMISSIVE for DELETE to public
  using (((usuario_id = conta_mestre_do_usuario(auth.uid())) AND (papel_do_membro() <> 'funcionario'::text)));

drop policy if exists categorias_insert on public.categorias;
create policy categorias_insert on public.categorias as PERMISSIVE for INSERT to public
  with check (((usuario_id = conta_mestre_do_usuario(auth.uid())) AND (papel_do_membro() <> 'funcionario'::text)));

drop policy if exists categorias_select on public.categorias;
create policy categorias_select on public.categorias as PERMISSIVE for SELECT to public
  using (((usuario_id IS NULL) OR (usuario_id = conta_mestre_do_usuario(auth.uid()))));

drop policy if exists categorias_update on public.categorias;
create policy categorias_update on public.categorias as PERMISSIVE for UPDATE to public
  using (((usuario_id = conta_mestre_do_usuario(auth.uid())) AND (papel_do_membro() <> 'funcionario'::text)))
  with check (((usuario_id = conta_mestre_do_usuario(auth.uid())) AND (papel_do_membro() <> 'funcionario'::text)));

drop policy if exists clientes_all on public.clientes;
create policy clientes_all on public.clientes as PERMISSIVE for ALL to public
  using (((usuario_id = conta_mestre_do_usuario(auth.uid())) AND empresa_acessivel(empresa_id)))
  with check (((usuario_id = conta_mestre_do_usuario(auth.uid())) AND empresa_acessivel(empresa_id)));

drop policy if exists config_negocio_all on public.config_negocio;
create policy config_negocio_all on public.config_negocio as PERMISSIVE for ALL to public
  using (((usuario_id = conta_mestre_do_usuario(auth.uid())) AND (papel_do_membro() <> 'funcionario'::text)))
  with check (((usuario_id = conta_mestre_do_usuario(auth.uid())) AND (papel_do_membro() <> 'funcionario'::text)));

drop policy if exists contas_fixas_all_own on public.contas_fixas;
create policy contas_fixas_all_own on public.contas_fixas as PERMISSIVE for ALL to public
  using ((usuario_id = auth.uid()))
  with check ((usuario_id = auth.uid()));

drop policy if exists contas_pagar_all on public.contas_pagar;
create policy contas_pagar_all on public.contas_pagar as PERMISSIVE for ALL to public
  using (((usuario_id = conta_mestre_do_usuario(auth.uid())) AND (papel_do_membro() <> 'funcionario'::text) AND empresa_acessivel(empresa_id)))
  with check (((usuario_id = conta_mestre_do_usuario(auth.uid())) AND (papel_do_membro() <> 'funcionario'::text) AND empresa_acessivel(empresa_id)));

drop policy if exists contas_receber_all on public.contas_receber;
create policy contas_receber_all on public.contas_receber as PERMISSIVE for ALL to public
  using (((usuario_id = conta_mestre_do_usuario(auth.uid())) AND (papel_do_membro() <> 'funcionario'::text) AND empresa_acessivel(empresa_id)))
  with check (((usuario_id = conta_mestre_do_usuario(auth.uid())) AND (papel_do_membro() <> 'funcionario'::text) AND empresa_acessivel(empresa_id)));

drop policy if exists contas_delete on public.contas;
create policy contas_delete on public.contas as PERMISSIVE for DELETE to authenticated
  using (((usuario_id = auth.uid()) OR ((usuario_id = conta_mestre_do_usuario(auth.uid())) AND (papel_do_membro() <> 'funcionario'::text))));

drop policy if exists contas_insert on public.contas;
create policy contas_insert on public.contas as PERMISSIVE for INSERT to authenticated
  with check (((usuario_id = auth.uid()) OR ((usuario_id = conta_mestre_do_usuario(auth.uid())) AND (papel_do_membro() <> 'funcionario'::text))));

drop policy if exists contas_select on public.contas;
create policy contas_select on public.contas as PERMISSIVE for SELECT to authenticated
  using (((usuario_id = auth.uid()) OR (usuario_id = conta_mestre_do_usuario(auth.uid()))));

drop policy if exists contas_update on public.contas;
create policy contas_update on public.contas as PERMISSIVE for UPDATE to authenticated
  using (((usuario_id = auth.uid()) OR ((usuario_id = conta_mestre_do_usuario(auth.uid())) AND (papel_do_membro() <> 'funcionario'::text))))
  with check (((usuario_id = auth.uid()) OR ((usuario_id = conta_mestre_do_usuario(auth.uid())) AND (papel_do_membro() <> 'funcionario'::text))));

drop policy if exists "dono ve e edita o proprio dado" on public.divida_parcelas;
create policy "dono ve e edita o proprio dado" on public.divida_parcelas as PERMISSIVE for ALL to public
  using ((usuario_id = auth.uid()))
  with check ((usuario_id = auth.uid()));

drop policy if exists dividas_all_own on public.dividas;
create policy dividas_all_own on public.dividas as PERMISSIVE for ALL to public
  using ((usuario_id = auth.uid()))
  with check ((usuario_id = auth.uid()));

drop policy if exists empresas_all_own on public.empresas;
create policy empresas_all_own on public.empresas as PERMISSIVE for ALL to public
  using ((usuario_id = auth.uid()))
  with check ((usuario_id = auth.uid()));

drop policy if exists empresas_select_membro on public.empresas;
create policy empresas_select_membro on public.empresas as PERMISSIVE for SELECT to public
  using (empresa_acessivel(id));

drop policy if exists fornecedores_all on public.fornecedores;
create policy fornecedores_all on public.fornecedores as PERMISSIVE for ALL to public
  using (((usuario_id = conta_mestre_do_usuario(auth.uid())) AND (papel_do_membro() <> 'funcionario'::text) AND empresa_acessivel(empresa_id)))
  with check (((usuario_id = conta_mestre_do_usuario(auth.uid())) AND (papel_do_membro() <> 'funcionario'::text) AND empresa_acessivel(empresa_id)));

drop policy if exists investimento_pagamentos_all_own on public.investimento_pagamentos;
create policy investimento_pagamentos_all_own on public.investimento_pagamentos as PERMISSIVE for ALL to public
  using ((usuario_id = auth.uid()))
  with check ((usuario_id = auth.uid()));

drop policy if exists investimento_parcelas_all_own on public.investimento_parcelas;
create policy investimento_parcelas_all_own on public.investimento_parcelas as PERMISSIVE for ALL to public
  using ((usuario_id = auth.uid()))
  with check ((usuario_id = auth.uid()));

drop policy if exists investimentos_all_own on public.investimentos;
create policy investimentos_all_own on public.investimentos as PERMISSIVE for ALL to public
  using ((usuario_id = auth.uid()))
  with check ((usuario_id = auth.uid()));

drop policy if exists limites_categoria_all_own on public.limites_categoria;
create policy limites_categoria_all_own on public.limites_categoria as PERMISSIVE for ALL to public
  using ((usuario_id = auth.uid()))
  with check ((usuario_id = auth.uid()));

drop policy if exists membros_delete on public.membros;
create policy membros_delete on public.membros as PERMISSIVE for DELETE to public
  using ((conta_mestre_id = auth.uid()));

drop policy if exists membros_insert on public.membros;
create policy membros_insert on public.membros as PERMISSIVE for INSERT to public
  with check ((conta_mestre_id = auth.uid()));

drop policy if exists membros_select on public.membros;
create policy membros_select on public.membros as PERMISSIVE for SELECT to public
  using (((conta_mestre_id = auth.uid()) OR (membro_usuario_id = auth.uid())));

drop policy if exists membros_update on public.membros;
create policy membros_update on public.membros as PERMISSIVE for UPDATE to public
  using ((conta_mestre_id = auth.uid()))
  with check ((conta_mestre_id = auth.uid()));

drop policy if exists metas_all_own on public.metas;
create policy metas_all_own on public.metas as PERMISSIVE for ALL to public
  using ((usuario_id = auth.uid()))
  with check ((usuario_id = auth.uid()));

drop policy if exists modelos_lancamento_all on public.modelos_lancamento;
create policy modelos_lancamento_all on public.modelos_lancamento as PERMISSIVE for ALL to public
  using ((usuario_id = auth.uid()))
  with check ((usuario_id = auth.uid()));

drop policy if exists notas_fiscais_all on public.notas_fiscais;
create policy notas_fiscais_all on public.notas_fiscais as PERMISSIVE for ALL to public
  using (((usuario_id = conta_mestre_do_usuario(auth.uid())) AND (papel_do_membro() <> 'funcionario'::text) AND empresa_acessivel(empresa_id)))
  with check (((usuario_id = conta_mestre_do_usuario(auth.uid())) AND (papel_do_membro() <> 'funcionario'::text) AND empresa_acessivel(empresa_id)));

drop policy if exists orcamentos_all on public.orcamentos;
create policy orcamentos_all on public.orcamentos as PERMISSIVE for ALL to public
  using (((usuario_id = conta_mestre_do_usuario(auth.uid())) AND (papel_do_membro() <> 'funcionario'::text) AND empresa_acessivel(empresa_id)))
  with check (((usuario_id = conta_mestre_do_usuario(auth.uid())) AND (papel_do_membro() <> 'funcionario'::text) AND empresa_acessivel(empresa_id)));

drop policy if exists preferencias_privacidade_all_own on public.preferencias_privacidade;
create policy preferencias_privacidade_all_own on public.preferencias_privacidade as PERMISSIVE for ALL to public
  using ((usuario_id = auth.uid()))
  with check ((usuario_id = auth.uid()));

drop policy if exists produtos_all on public.produtos;
create policy produtos_all on public.produtos as PERMISSIVE for ALL to public
  using (((usuario_id = conta_mestre_do_usuario(auth.uid())) AND empresa_acessivel(empresa_id)))
  with check (((usuario_id = conta_mestre_do_usuario(auth.uid())) AND empresa_acessivel(empresa_id)));

drop policy if exists push_subscriptions_all_own on public.push_subscriptions;
create policy push_subscriptions_all_own on public.push_subscriptions as PERMISSIVE for ALL to public
  using ((usuario_id = auth.uid()))
  with check ((usuario_id = auth.uid()));

drop policy if exists servicos_all on public.servicos;
create policy servicos_all on public.servicos as PERMISSIVE for ALL to public
  using (((usuario_id = conta_mestre_do_usuario(auth.uid())) AND empresa_acessivel(empresa_id)))
  with check (((usuario_id = conta_mestre_do_usuario(auth.uid())) AND empresa_acessivel(empresa_id)));

drop policy if exists transacoes_delete on public.transacoes;
create policy transacoes_delete on public.transacoes as PERMISSIVE for DELETE to public
  using (((usuario_id = auth.uid()) OR ((tipo_negocio = 'negocio'::text) AND (usuario_id = conta_mestre_do_usuario(auth.uid())) AND (papel_do_membro() <> 'funcionario'::text))));

drop policy if exists transacoes_insert on public.transacoes;
create policy transacoes_insert on public.transacoes as PERMISSIVE for INSERT to public
  with check (((usuario_id = auth.uid()) OR ((tipo_negocio = 'negocio'::text) AND (usuario_id = conta_mestre_do_usuario(auth.uid())))));

drop policy if exists transacoes_select on public.transacoes;
create policy transacoes_select on public.transacoes as PERMISSIVE for SELECT to public
  using (((usuario_id = auth.uid()) OR ((tipo_negocio = 'negocio'::text) AND (usuario_id = conta_mestre_do_usuario(auth.uid())) AND (papel_do_membro() <> 'funcionario'::text))));

drop policy if exists transacoes_update on public.transacoes;
create policy transacoes_update on public.transacoes as PERMISSIVE for UPDATE to public
  using (((usuario_id = auth.uid()) OR ((tipo_negocio = 'negocio'::text) AND (usuario_id = conta_mestre_do_usuario(auth.uid())) AND (papel_do_membro() <> 'funcionario'::text))))
  with check (((usuario_id = auth.uid()) OR ((tipo_negocio = 'negocio'::text) AND (usuario_id = conta_mestre_do_usuario(auth.uid())) AND (papel_do_membro() <> 'funcionario'::text))));

drop policy if exists user_authenticators_delete_own on public.user_authenticators;
create policy user_authenticators_delete_own on public.user_authenticators as PERMISSIVE for DELETE to public
  using ((user_id = auth.uid()));

drop policy if exists user_authenticators_select_own on public.user_authenticators;
create policy user_authenticators_select_own on public.user_authenticators as PERMISSIVE for SELECT to public
  using ((user_id = auth.uid()));

drop policy if exists user_consents_select_own on public.user_consents;
create policy user_consents_select_own on public.user_consents as PERMISSIVE for SELECT to public
  using ((user_id = auth.uid()));

drop policy if exists usuarios_delete_own on public.usuarios;
create policy usuarios_delete_own on public.usuarios as PERMISSIVE for DELETE to public
  using ((id = auth.uid()));

drop policy if exists usuarios_insert_own on public.usuarios;
create policy usuarios_insert_own on public.usuarios as PERMISSIVE for INSERT to public
  with check ((id = auth.uid()));

drop policy if exists usuarios_select_mestre on public.usuarios;
create policy usuarios_select_mestre on public.usuarios as PERMISSIVE for SELECT to public
  using ((id = conta_mestre_do_usuario(auth.uid())));

drop policy if exists usuarios_select_own on public.usuarios;
create policy usuarios_select_own on public.usuarios as PERMISSIVE for SELECT to public
  using ((id = auth.uid()));

drop policy if exists usuarios_update_own on public.usuarios;
create policy usuarios_update_own on public.usuarios as PERMISSIVE for UPDATE to public
  using ((id = auth.uid()))
  with check (((id = auth.uid()) AND ((plano = ( SELECT usuarios_1.plano
   FROM usuarios usuarios_1
  WHERE (usuarios_1.id = auth.uid()))) OR (plano = 'gratis'::text))));

drop policy if exists vendas_all on public.vendas;
create policy vendas_all on public.vendas as PERMISSIVE for ALL to public
  using (((usuario_id = conta_mestre_do_usuario(auth.uid())) AND empresa_acessivel(empresa_id)))
  with check (((usuario_id = conta_mestre_do_usuario(auth.uid())) AND empresa_acessivel(empresa_id)));

-- ---------- Políticas de arquivos (storage.objects) ----------

drop policy if exists avatars_select_public on storage.objects;
create policy avatars_select_public on storage.objects for SELECT to public
  using ((bucket_id = 'avatars'::text));

drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects for INSERT to public
  with check (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects for UPDATE to public
  using (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects for DELETE to public
  using (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

drop policy if exists comprovantes_select_dono on storage.objects;
create policy comprovantes_select_dono on storage.objects for SELECT to authenticated
  using (((bucket_id = 'comprovantes-documentos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

drop policy if exists comprovantes_delete_dono on storage.objects;
create policy comprovantes_delete_dono on storage.objects for DELETE to authenticated
  using (((bucket_id = 'comprovantes-documentos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
