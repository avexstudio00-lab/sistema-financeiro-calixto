-- 13/nov/2026 — PR30: vendedores (comissão ou preço de repasse), metas
-- (por vendedor e de lucro líquido) e valor combinado do fiado.
-- Rodar DEPOIS do 20261113000000_agenda_e_acesso_por_empresa.sql.

-- Preço de repasse: quanto o vendedor de repasse te paga por peça.
alter table public.produtos add column if not exists preco_repasse numeric(14,2);

-- Na venda: o repasse da peça naquele dia (não muda se o cadastro mudar) e o
-- acréscimo combinado no parcelado (já somado ao valor_total da 1ª linha).
alter table public.vendas add column if not exists repasse_unitario numeric(14,2);
alter table public.vendas add column if not exists acrescimo numeric(14,2);

-- Meta de lucro líquido do mês (a meta de faturamento já existe).
alter table public.config_negocio add column if not exists meta_lucro numeric(14,2);

create table if not exists public.vendedores (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  empresa_id uuid references public.empresas(id) on delete cascade,
  nome text not null,
  -- comissao: ganha X% do que vende. repasse: te paga o preço de repasse de
  -- cada peça e fica com o que vender acima. nenhum: só acompanhar.
  modelo text not null default 'comissao' check (modelo in ('comissao', 'repasse', 'nenhum')),
  comissao_pct numeric(5,2) check (comissao_pct is null or (comissao_pct >= 0 and comissao_pct <= 100)),
  meta_mensal numeric(14,2),
  telefone text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create unique index if not exists vendedores_nome_unico on public.vendedores (usuario_id, lower(nome));

drop trigger if exists trg_preencher_empresa_id on public.vendedores;
create trigger trg_preencher_empresa_id before insert on public.vendedores
  for each row execute function public.preencher_empresa_id();

alter table public.vendedores enable row level security;

-- Todos da conta veem os nomes (pra escolher na venda); só dono/sócio mexe.
drop policy if exists vendedores_select on public.vendedores;
create policy vendedores_select on public.vendedores as permissive for select to authenticated
  using (usuario_id = conta_mestre_do_usuario(auth.uid()) and empresa_acessivel(empresa_id));

drop policy if exists vendedores_escrita on public.vendedores;
create policy vendedores_escrita on public.vendedores as permissive for all to authenticated
  using (usuario_id = conta_mestre_do_usuario(auth.uid()) and empresa_acessivel(empresa_id) and papel_do_membro() <> 'funcionario')
  with check (usuario_id = conta_mestre_do_usuario(auth.uid()) and empresa_acessivel(empresa_id) and papel_do_membro() <> 'funcionario');
