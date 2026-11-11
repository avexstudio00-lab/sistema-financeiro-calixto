-- 10/nov/2026 — PR26: identificação fiscal da empresa e meta do mês.
alter table public.config_negocio add column if not exists regime_fiscal jsonb;
alter table public.config_negocio add column if not exists meta_faturamento numeric(14,2);
