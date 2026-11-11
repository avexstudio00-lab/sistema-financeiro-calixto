-- 10/nov/2026 — PR25: receber várias de uma vez (parcela paga em parte),
-- taxas da maquininha e central de notificações (sininho).

-- 1) Parcela de empréstimo/revenda paga EM PARTE: quanto já entrou.
alter table public.investimento_parcelas
  add column if not exists valor_recebido numeric(12,2) not null default 0;

-- 2) Taxas da maquininha (config do negócio) e a taxa de cada venda.
alter table public.config_negocio add column if not exists taxas_maquininha jsonb;
alter table public.vendas add column if not exists taxa_maquininha numeric(12,2);
alter table public.vendas add column if not exists parcelas_cartao smallint;
alter table public.vendas add column if not exists taxa_transacao_id uuid references public.transacoes(id) on delete set null;

insert into public.categorias (nome, tipo, icone, cor, is_padrao)
select 'Taxas de cartão', 'despesa', 'credit-card', '#B45309', true
where not exists (select 1 from public.categorias where usuario_id is null and nome = 'Taxas de cartão');

-- 3) Central de notificações: a rotina diária grava; cada um só vê as suas.
create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  area text not null default 'pessoal' check (area in ('pessoal', 'empresa')),
  titulo text not null,
  corpo text not null,
  url text,
  criada_em timestamptz not null default now(),
  lida_em timestamptz
);
create index if not exists notificacoes_usuario_criada on public.notificacoes (usuario_id, criada_em desc);
alter table public.notificacoes enable row level security;

drop policy if exists "notificacoes_ler_proprias" on public.notificacoes;
create policy "notificacoes_ler_proprias" on public.notificacoes
  for select using (auth.uid() = usuario_id);
drop policy if exists "notificacoes_marcar_lidas" on public.notificacoes;
create policy "notificacoes_marcar_lidas" on public.notificacoes
  for update using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);
drop policy if exists "notificacoes_apagar_proprias" on public.notificacoes;
create policy "notificacoes_apagar_proprias" on public.notificacoes
  for delete using (auth.uid() = usuario_id);
