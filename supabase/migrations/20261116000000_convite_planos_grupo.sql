-- Corrige o convite de pessoas (14/nov/2026)
-- O banco só aceitava o plano "grupo" e mostrava um preço antigo (R$ 65).
-- Agora aceita os dois planos com gestão de grupo: Grupo e Grupo Bi-empresa.
-- Pode rodar a qualquer hora (não depende de merge).

create or replace function public.valida_convite_membro()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_plano text;
  v_total int;
begin
  select plano into v_plano from public.usuarios where id = new.conta_mestre_id;

  if v_plano is null or v_plano not in ('grupo', 'grupo_multi') then
    raise exception 'Convidar pessoas pro painel compartilhado é exclusivo dos planos com gestão de grupo (Grupo ou Grupo Bi-empresa).';
  end if;

  select count(*) into v_total
    from public.membros
    where conta_mestre_id = new.conta_mestre_id
      and status in ('pendente', 'ativo');

  if v_total >= 2 then
    raise exception 'Seu plano permite até 3 pessoas no total (você + 2 convidados). Remova alguém antes de convidar outra pessoa.';
  end if;

  if exists (
    select 1 from public.membros
    where conta_mestre_id = new.conta_mestre_id
      and lower(email) = lower(new.email)
      and status in ('pendente', 'ativo')
  ) then
    raise exception 'Esse e-mail já foi convidado.';
  end if;

  return new;
end;
$function$;
