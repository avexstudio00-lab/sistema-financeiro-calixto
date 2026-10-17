-- Seção 15 (15/out/2026): venda com vários itens + fiado flexível. Só acréscimos.
-- Já aplicada no projeto Supabase em 15/out/2026 (venda_multiplos_itens_fiado_flexivel_15out2026).
alter table public.vendas add column if not exists grupo_venda_id uuid;
create index if not exists vendas_grupo_venda_idx on public.vendas (usuario_id, grupo_venda_id) where grupo_venda_id is not null;
alter table public.contas_receber add column if not exists venda_grupo_id uuid;
create index if not exists contas_receber_venda_grupo_idx on public.contas_receber (venda_grupo_id) where venda_grupo_id is not null;
alter table public.clientes add column if not exists padrao_fiado jsonb;
comment on column public.vendas.grupo_venda_id is 'Linhas da mesma venda (carrinho com vários itens). O lançamento de caixa e os pagamentos ficam na 1ª linha.';
comment on column public.contas_receber.venda_grupo_id is 'Parcelas do fiado ligadas à venda (vendas.grupo_venda_id).';
comment on column public.clientes.padrao_fiado is 'Condições de fiado preferidas do cliente: {parcelas, periodicidade, dias_primeiro_vencimento, entrada_percentual}.';
