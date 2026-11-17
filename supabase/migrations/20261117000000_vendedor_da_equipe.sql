-- Vendedor da equipe (17/nov/2026)
-- Quem aceita o convite para a equipe (sócio ou funcionário) já aparece em
-- Vendedores, com o nome do perfil dele. As vendas que ele lança já saem com
-- esse nome em "Quem vendeu", então o ranking, a meta e a comissão casam
-- sozinhos. O dono só escolhe como o vendedor ganha (comissão ou repasse).
-- Se a pessoa sair da equipe, o vendedor fica inativo (o histórico fica).
-- Pode rodar a qualquer hora (não depende de merge).

alter table public.vendedores
  add column if not exists membro_id uuid references public.membros(id) on delete set null;

create unique index if not exists vendedores_membro_id_unico
  on public.vendedores (membro_id) where membro_id is not null;

create or replace function public.sincronizar_vendedor_membro()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_nome text;
begin
  if new.status = 'ativo' and new.membro_usuario_id is not null then
    select nullif(trim(nome), '') into v_nome from public.usuarios where id = new.membro_usuario_id;
    v_nome := coalesce(v_nome, split_part(new.email, '@', 1));

    -- Já existe um vendedor com o mesmo nome cadastrado à mão? Liga nele.
    if not exists (select 1 from public.vendedores where membro_id = new.id) then
      update public.vendedores
         set membro_id = new.id, ativo = true
       where id = (
         select id from public.vendedores
          where usuario_id = new.conta_mestre_id
            and membro_id is null
            and lower(trim(nome)) = lower(v_nome)
          order by criado_em
          limit 1
       );
    end if;

    if not exists (select 1 from public.vendedores where membro_id = new.id) then
      insert into public.vendedores (usuario_id, empresa_id, nome, modelo, ativo, membro_id)
      values (new.conta_mestre_id, new.empresa_id, left(v_nome, 80), 'nenhum', true, new.id);
    else
      update public.vendedores set ativo = true where membro_id = new.id;
    end if;
  elsif new.status = 'removido' then
    update public.vendedores set ativo = false where membro_id = new.id;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_sincronizar_vendedor_membro on public.membros;
create trigger trg_sincronizar_vendedor_membro
  after insert or update of status, membro_usuario_id on public.membros
  for each row execute function public.sincronizar_vendedor_membro();

-- Quem já está na equipe hoje entra agora (dispara o gatilho acima).
update public.membros set status = status where status = 'ativo' and membro_usuario_id is not null;
