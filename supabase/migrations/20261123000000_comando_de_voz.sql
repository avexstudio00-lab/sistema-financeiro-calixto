-- Comando de voz (23/nov/2026): microfone dentro do app + atalho da Siri.
--
-- voz_tokens: o "código pessoal" que vai dentro do atalho da Siri. Só o
-- hash (sha-256) fica no banco; o código em si aparece uma vez na tela.
-- Sem policy nenhuma: só o servidor (service role) lê e grava, igual
-- eventos_seguranca.
--
-- anotacoes_voz: cada frase falada. Pela Siri, entra como "pendente" e a
-- pessoa confere e salva quando abrir o app (nada vai pro saldo sem
-- conferir). Pelo microfone do app, já entra como "salva". Também serve pra
-- medir se o recurso está sendo usado (contar por origem).
--
-- Pode rodar a qualquer hora. Sem ele, o microfone do app funciona (só não
-- conta o uso) e a parte da Siri avisa que falta configurar.

create table if not exists public.voz_tokens (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text not null unique,
  criado_em timestamptz not null default now(),
  ultimo_uso timestamptz
);
alter table public.voz_tokens enable row level security;

create table if not exists public.anotacoes_voz (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  origem text not null check (origem in ('app', 'siri')),
  texto text not null check (char_length(texto) between 1 and 500),
  status text not null default 'pendente' check (status in ('pendente', 'salva', 'descartada')),
  criado_em timestamptz not null default now(),
  resolvido_em timestamptz
);
alter table public.anotacoes_voz enable row level security;

drop policy if exists anotacoes_voz_select_own on public.anotacoes_voz;
create policy anotacoes_voz_select_own on public.anotacoes_voz
  for select using (usuario_id = auth.uid());

-- Pelo app só entra o que já foi salvo (a Siri grava pelo servidor).
drop policy if exists anotacoes_voz_insert_own on public.anotacoes_voz;
create policy anotacoes_voz_insert_own on public.anotacoes_voz
  for insert with check (usuario_id = auth.uid() and origem = 'app');

drop policy if exists anotacoes_voz_update_own on public.anotacoes_voz;
create policy anotacoes_voz_update_own on public.anotacoes_voz
  for update using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

create index if not exists anotacoes_voz_pendentes
  on public.anotacoes_voz (usuario_id, criado_em desc) where status = 'pendente';
