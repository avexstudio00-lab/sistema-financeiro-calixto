-- Código curto para cada empréstimo (E1, E2...) e compra e revenda (R1, R2...)
-- por usuário (10/nov/2026). Serve pra diferenciar dois empréstimos da mesma
-- pessoa na busca e na importação de extrato. O número nunca é reaproveitado.

alter table public.investimentos add column if not exists codigo text;

create or replace function public.definir_codigo_investimento()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  prefixo text;
  proximo integer;
begin
  if new.codigo is not null and new.codigo <> '' then
    return new;
  end if;
  prefixo := case new.tipo when 'emprestimo' then 'E' when 'revenda' then 'R' else null end;
  if prefixo is null then
    return new;
  end if;
  -- Evita dois cadastros ao mesmo tempo pegarem o mesmo número.
  perform pg_advisory_xact_lock(hashtext(new.usuario_id::text || ':' || prefixo));
  select coalesce(max(substring(codigo from 2)::integer), 0) + 1
    into proximo
    from public.investimentos
   where usuario_id = new.usuario_id
     and codigo ~ ('^' || prefixo || '[0-9]+$');
  new.codigo := prefixo || proximo;
  return new;
end;
$$;

drop trigger if exists investimentos_codigo on public.investimentos;
create trigger investimentos_codigo
  before insert on public.investimentos
  for each row execute function public.definir_codigo_investimento();

-- Numera os que já existem, do mais antigo pro mais novo.
with numerados as (
  select id,
         case tipo when 'emprestimo' then 'E' else 'R' end
           || row_number() over (partition by usuario_id, tipo order by data_criacao, id) as novo
    from public.investimentos
   where tipo in ('emprestimo', 'revenda')
     and (codigo is null or codigo = '')
)
update public.investimentos i
   set codigo = n.novo
  from numerados n
 where i.id = n.id;

create unique index if not exists investimentos_usuario_codigo_unico
  on public.investimentos (usuario_id, codigo)
  where codigo is not null;
