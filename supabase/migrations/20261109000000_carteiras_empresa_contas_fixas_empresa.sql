-- 09/nov/2026 — carteiras da empresa separadas das pessoais + contas fixas
-- da empresa. Só ADICIONA colunas com valor padrão (nada existente muda:
-- toda carteira/conta fixa atual continua "pessoal").
-- Rodar no SQL Editor do Supabase ANTES de mesclar o PR #19.

-- 1) Carteira pessoal x carteira da empresa.
alter table public.contas
  add column if not exists ambiente text not null default 'pessoal';
alter table public.contas drop constraint if exists contas_ambiente_check;
alter table public.contas
  add constraint contas_ambiente_check check (ambiente in ('pessoal', 'empresa'));

-- 2) Contas fixas da empresa (aluguel do ponto, internet da loja...).
alter table public.contas_fixas
  add column if not exists tipo_negocio text not null default 'pessoal';
alter table public.contas_fixas drop constraint if exists contas_fixas_tipo_negocio_check;
alter table public.contas_fixas
  add constraint contas_fixas_tipo_negocio_check check (tipo_negocio in ('pessoal', 'negocio'));
alter table public.contas_fixas
  add column if not exists empresa_id uuid null;

-- Desfazer (se precisar):
-- alter table public.contas drop column ambiente;
-- alter table public.contas_fixas drop column tipo_negocio, drop column empresa_id;
