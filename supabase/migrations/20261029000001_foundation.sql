-- Northline · 0001 · Fundação: perfis, preferências e utilitários de RLS.
-- Toda tabela de dados do usuário tem user_id, RLS habilitado e políticas "somente o dono".

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Cria as 4 políticas padrão (select/insert/update/delete) restritas ao dono da linha.
-- O user_id nunca é confiado ao cliente: o WITH CHECK exige que seja igual a auth.uid().
create or replace function public.nl_apply_owner_policies(tbl regclass)
returns void
language plpgsql
as $$
declare
  t text := tbl::text;
  n text := replace(t, 'public.', '');
begin
  execute format('alter table %s enable row level security', t);
  execute format('alter table %s force row level security', t);
  execute format('drop policy if exists %I on %s', n || '_select_own', t);
  execute format('drop policy if exists %I on %s', n || '_insert_own', t);
  execute format('drop policy if exists %I on %s', n || '_update_own', t);
  execute format('drop policy if exists %I on %s', n || '_delete_own', t);
  execute format('create policy %I on %s for select to authenticated using (user_id = (select auth.uid()))', n || '_select_own', t);
  execute format('create policy %I on %s for insert to authenticated with check (user_id = (select auth.uid()))', n || '_insert_own', t);
  execute format('create policy %I on %s for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', n || '_update_own', t);
  execute format('create policy %I on %s for delete to authenticated using (user_id = (select auth.uid()))', n || '_delete_own', t);
  execute format('drop trigger if exists set_updated_at on %s', t);
  execute format('create trigger set_updated_at before update on %s for each row execute function public.set_updated_at()', t);
  execute format('grant select, insert, update, delete on %s to authenticated', t);
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  user_id uuid generated always as (id) stored,
  display_name text not null default '' check (char_length(display_name) <= 80),
  timezone text not null default 'America/Recife' check (char_length(timezone) between 3 and 64),
  currency text not null default 'BRL' check (currency = 'BRL'),
  locale text not null default 'pt-BR' check (locale = 'pt-BR'),
  default_reminder_minutes integer default 10 check (default_reminder_minutes is null or default_reminder_minutes between 0 and 10080),
  week_starts_on smallint not null default 1 check (week_starts_on in (0, 1)),
  notifications jsonb not null default '{"events":true,"tasks":true,"habits":true,"workouts":true}'::jsonb,
  -- consentimento explícito para guardar transcrições de voz (padrão: não guardar)
  store_voice_transcripts boolean not null default false,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

select public.nl_apply_owner_policies('public.profiles');
-- o perfil é criado pelo trigger; o usuário não insere nem apaga o próprio perfil diretamente
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_delete_own on public.profiles;

-- Cria o perfil automaticamente quando o usuário se cadastra.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(left(new.raw_user_meta_data ->> 'display_name', 80), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
