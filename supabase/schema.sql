-- Ritmo Híbrido · esquema de base de datos (Supabase / Postgres)
-- Ejecuta este archivo una vez en Supabase › SQL Editor de un proyecto NUEVO (no el de la app de Amaia).

-- 1) Estado de cada usuario: perfil, plan, registros y chat en un único documento JSON.
create table if not exists public.user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.user_state enable row level security;

drop policy if exists "own state: select" on public.user_state;
drop policy if exists "own state: insert" on public.user_state;
drop policy if exists "own state: update" on public.user_state;
drop policy if exists "own state: delete" on public.user_state;
create policy "own state: select" on public.user_state for select using (auth.uid() = user_id);
create policy "own state: insert" on public.user_state for insert with check (auth.uid() = user_id);
create policy "own state: update" on public.user_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own state: delete" on public.user_state for delete using (auth.uid() = user_id);

-- tamaño máximo por usuario (evita abusos del almacenamiento gratuito)
alter table public.user_state drop constraint if exists user_state_size;
alter table public.user_state add constraint user_state_size check (pg_column_size(data) < 3000000);

-- 2) Uso del coach IA por mes. Solo la función del servidor (service role) escribe aquí.
create table if not exists public.coach_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null,              -- 'YYYY-MM'
  chat int not null default 0,
  plans int not null default 0,
  primary key (user_id, month)
);
alter table public.coach_usage enable row level security;
drop policy if exists "own usage: select" on public.coach_usage;
create policy "own usage: select" on public.coach_usage for select using (auth.uid() = user_id);

-- Suma 1 al contador si queda cupo. Devuelve el nuevo valor, o -1 si se ha agotado.
create or replace function public.coach_take(p_user uuid, p_kind text, p_limit int)
returns int language plpgsql security definer set search_path = public as $$
declare m text := to_char(now() at time zone 'utc', 'YYYY-MM'); v int;
begin
  insert into coach_usage(user_id, month) values (p_user, m) on conflict do nothing;
  if p_kind = 'chat' then
    update coach_usage set chat = chat + 1 where user_id = p_user and month = m and chat < p_limit returning chat into v;
  else
    update coach_usage set plans = plans + 1 where user_id = p_user and month = m and plans < p_limit returning plans into v;
  end if;
  return coalesce(v, -1);
end $$;

-- Devuelve una unidad si la llamada a la IA falló (para no cobrar cupo por errores).
create or replace function public.coach_refund(p_user uuid, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
declare m text := to_char(now() at time zone 'utc', 'YYYY-MM');
begin
  if p_kind = 'chat' then update coach_usage set chat = greatest(chat - 1, 0) where user_id = p_user and month = m;
  else update coach_usage set plans = greatest(plans - 1, 0) where user_id = p_user and month = m; end if;
end $$;

revoke all on function public.coach_take(uuid, text, int) from public, anon, authenticated;
revoke all on function public.coach_refund(uuid, text) from public, anon, authenticated;
