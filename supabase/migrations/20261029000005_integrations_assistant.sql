-- Northline · 0005 · Integrações, notificações remotas e assistente.

-- Estado visível ao usuário (sem segredos).
create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider text not null check (provider in ('google_calendar')),
  account_email text,
  calendar_id text not null default 'primary',
  status text not null default 'connected' check (status in ('connected', 'revoked', 'error')),
  last_sync_at timestamptz,
  last_error text check (char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integrations_one_per_provider unique (user_id, provider)
);
select public.nl_apply_owner_policies('public.integrations');
-- conexões são criadas e removidas apenas pelas Edge Functions (service role)
drop policy if exists integrations_insert_own on public.integrations;
drop policy if exists integrations_update_own on public.integrations;

-- Tokens OAuth cifrados (AES-GCM nas Edge Functions). RLS ligado e NENHUMA política:
-- nem o próprio usuário consegue ler pela API; só a service role, no backend.
create table if not exists public.integration_secrets (
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('google_calendar')),
  access_token_enc text not null,
  refresh_token_enc text,
  expires_at timestamptz,
  scope text,
  sync_token text,
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table public.integration_secrets enable row level security;
alter table public.integration_secrets force row level security;
revoke all on public.integration_secrets from anon, authenticated;

-- Conflitos de sincronização aguardando decisão do usuário (nada é sobrescrito em silêncio).
create table if not exists public.sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  event_id uuid not null,
  provider text not null default 'google_calendar',
  local_snapshot jsonb not null,
  remote_snapshot jsonb not null,
  resolved_at timestamptz,
  resolution text check (resolution in ('keep_local', 'keep_remote')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sync_conflicts_event_same_user foreign key (event_id, user_id) references public.events (id, user_id) on delete cascade
);
select public.nl_apply_owner_policies('public.sync_conflicts');

-- Tokens de push (Expo) por dispositivo, para notificações remotas futuras.
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  token text not null check (char_length(token) <= 300),
  platform text not null check (platform in ('ios', 'android', 'web')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_tokens_unique unique (user_id, token)
);
select public.nl_apply_owner_policies('public.push_tokens');

-- Histórico do assistente (retenção limitada: ver purge_old_assistant_data).
create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 8000),
  payload jsonb,
  engine text check (engine in ('local', 'ai')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists assistant_messages_user_created on public.assistant_messages (user_id, created_at desc);
select public.nl_apply_owner_policies('public.assistant_messages');

-- Limite de uso diário da IA, contado pelo backend.
create table if not exists public.assistant_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  requests integer not null default 0,
  transcriptions integer not null default 0,
  primary key (user_id, day)
);
alter table public.assistant_usage enable row level security;
alter table public.assistant_usage force row level security;
drop policy if exists assistant_usage_select_own on public.assistant_usage;
create policy assistant_usage_select_own on public.assistant_usage for select to authenticated using (user_id = (select auth.uid()));
grant select on public.assistant_usage to authenticated;

-- Incremento atômico usado pelas Edge Functions (service role) para aplicar o limite.
create or replace function public.increment_assistant_usage(p_user uuid, p_kind text, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.assistant_usage (user_id, day) values (p_user, current_date) on conflict do nothing;
  if p_kind = 'transcription' then
    update public.assistant_usage set transcriptions = transcriptions + 1
      where user_id = p_user and day = current_date returning transcriptions into v_count;
  else
    update public.assistant_usage set requests = requests + 1
      where user_id = p_user and day = current_date returning requests into v_count;
  end if;
  return v_count <= p_limit;
end;
$$;
revoke execute on function public.increment_assistant_usage(uuid, text, integer) from public, anon, authenticated;

-- Política de retenção: histórico do assistente por 90 dias, uso por 30 dias.
-- Agende com pg_cron: select cron.schedule('nl-retention', '0 4 * * *', 'select public.purge_old_assistant_data()');
create or replace function public.purge_old_assistant_data()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.assistant_messages where created_at < now() - interval '90 days';
  delete from public.assistant_usage where day < current_date - 30;
  delete from public.sync_conflicts where resolved_at < now() - interval '30 days';
$$;
revoke execute on function public.purge_old_assistant_data() from public, anon, authenticated;
