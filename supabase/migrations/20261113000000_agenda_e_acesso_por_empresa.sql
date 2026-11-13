-- 13/nov/2026 — PR29: agenda de serviços.
-- Marca cliente + serviço + dia/hora. Lembrete no celular de manhã (cron
-- /api/cron/notificacoes) e, no dia, vira venda com 1 toque.
-- Mesmas regras de acesso de clientes/serviços: conta mestre + empresa
-- acessível (quem foi convidado só pra uma empresa só vê a agenda dela).

create table if not exists public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  empresa_id uuid references public.empresas(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  servico_id uuid references public.servicos(id) on delete set null,
  descricao text not null,
  inicio timestamptz not null,
  duracao_min integer not null default 60 check (duracao_min between 5 and 1440),
  valor numeric(14,2),
  status text not null default 'marcado'
    check (status in ('marcado', 'confirmado', 'concluido', 'cancelado', 'faltou')),
  observacoes text,
  venda_grupo_id uuid,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);

create index if not exists agendamentos_usuario_inicio on public.agendamentos (usuario_id, inicio);
create index if not exists agendamentos_cliente on public.agendamentos (cliente_id) where cliente_id is not null;

drop trigger if exists trg_preencher_empresa_id on public.agendamentos;
create trigger trg_preencher_empresa_id before insert on public.agendamentos
  for each row execute function public.preencher_empresa_id();

alter table public.agendamentos enable row level security;

drop policy if exists agendamentos_all on public.agendamentos;
create policy agendamentos_all on public.agendamentos as permissive for all to authenticated
  using (usuario_id = conta_mestre_do_usuario(auth.uid()) and empresa_acessivel(empresa_id))
  with check (usuario_id = conta_mestre_do_usuario(auth.uid()) and empresa_acessivel(empresa_id));

-- ---------------------------------------------------------------------------
-- Convite por empresa (13/nov/2026): o sócio convidado só pra empresa A não
-- pode ver os lançamentos de negócio da empresa B. As outras tabelas da
-- empresa (vendas, clientes, contas a pagar/receber...) já usavam
-- empresa_acessivel; faltava em transacoes. Só muda o ramo do MEMBRO
-- convidado — o dono (usuario_id = auth.uid()) continua igual.
-- Lançamento antigo sem empresa (empresa_id nulo) continua visível.

drop policy if exists transacoes_select on public.transacoes;
create policy transacoes_select on public.transacoes as permissive for select to public
  using (
    usuario_id = auth.uid()
    or (
      tipo_negocio = 'negocio'
      and usuario_id = conta_mestre_do_usuario(auth.uid())
      and papel_do_membro() <> 'funcionario'
      and (empresa_id is null or empresa_acessivel(empresa_id))
    )
  );

drop policy if exists transacoes_insert on public.transacoes;
create policy transacoes_insert on public.transacoes as permissive for insert to public
  with check (
    usuario_id = auth.uid()
    or (
      tipo_negocio = 'negocio'
      and usuario_id = conta_mestre_do_usuario(auth.uid())
      and (empresa_id is null or empresa_acessivel(empresa_id))
    )
  );

drop policy if exists transacoes_update on public.transacoes;
create policy transacoes_update on public.transacoes as permissive for update to public
  using (
    usuario_id = auth.uid()
    or (
      tipo_negocio = 'negocio'
      and usuario_id = conta_mestre_do_usuario(auth.uid())
      and papel_do_membro() <> 'funcionario'
      and (empresa_id is null or empresa_acessivel(empresa_id))
    )
  )
  with check (
    usuario_id = auth.uid()
    or (
      tipo_negocio = 'negocio'
      and usuario_id = conta_mestre_do_usuario(auth.uid())
      and papel_do_membro() <> 'funcionario'
      and (empresa_id is null or empresa_acessivel(empresa_id))
    )
  );

drop policy if exists transacoes_delete on public.transacoes;
create policy transacoes_delete on public.transacoes as permissive for delete to public
  using (
    usuario_id = auth.uid()
    or (
      tipo_negocio = 'negocio'
      and usuario_id = conta_mestre_do_usuario(auth.uid())
      and papel_do_membro() <> 'funcionario'
      and (empresa_id is null or empresa_acessivel(empresa_id))
    )
  );

-- ---------------------------------------------------------------------------
-- Quem vendeu (13/nov/2026): etiqueta com o nome do vendedor em cada venda,
-- pra separar vendas, comissão e distribuição de lucro. vendedor_id guarda
-- quem estava logado; vendedor_nome é o nome escolhido no formulário (pode
-- ser um vendedor sem login).
alter table public.vendas add column if not exists vendedor_id uuid default auth.uid();
alter table public.vendas add column if not exists vendedor_nome text;
create index if not exists vendas_vendedor_nome on public.vendas (usuario_id, vendedor_nome) where vendedor_nome is not null;
