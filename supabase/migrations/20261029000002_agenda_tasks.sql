-- Northline · 0002 · Agenda e tarefas.

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (char_length(description) <= 5000),
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  timezone text not null default 'America/Recife',
  location text check (char_length(location) <= 300),
  meeting_url text check (meeting_url is null or meeting_url ~* '^https?://'),
  category text not null default 'personal' check (category in ('work', 'study', 'personal', 'meeting', 'health', 'other')),
  color text,
  reminder_minutes integer check (reminder_minutes is null or reminder_minutes between 0 and 10080),
  recurrence jsonb check (recurrence is null or (recurrence ? 'freq' and recurrence ->> 'freq' in ('daily', 'weekly', 'monthly', 'yearly'))),
  recurrence_exceptions timestamptz[] not null default '{}',
  recurring_event_id uuid,
  original_start_at timestamptz,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  source text not null default 'northline' check (source in ('northline', 'assistant', 'google', 'task', 'workout')),
  external_id text,
  external_etag text,
  external_updated_at timestamptz,
  sync_status text not null default 'local' check (sync_status in ('local', 'pending', 'synced', 'conflict', 'error')),
  task_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_range check (end_at > start_at),
  constraint events_id_user unique (id, user_id),
  constraint events_parent_same_user foreign key (recurring_event_id, user_id) references public.events (id, user_id) on delete cascade
);
-- evita duplicar eventos importados do Google
create unique index if not exists events_external_unique on public.events (user_id, external_id) where external_id is not null;
create index if not exists events_user_start on public.events (user_id, start_at);
create index if not exists events_user_recurring on public.events (user_id) where recurrence is not null;
select public.nl_apply_owner_policies('public.events');

create table if not exists public.task_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_lists_id_user unique (id, user_id)
);
select public.nl_apply_owner_policies('public.task_lists');

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (char_length(description) <= 5000),
  due_date date,
  due_time time,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  category text not null default 'personal' check (category in ('work', 'study', 'personal', 'meeting', 'health', 'other')),
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  list_id uuid,
  recurrence jsonb check (recurrence is null or recurrence ? 'freq'),
  reminder_minutes integer check (reminder_minutes is null or reminder_minutes between 0 and 10080),
  completed_at timestamptz,
  event_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_time_needs_date check (due_time is null or due_date is not null),
  constraint tasks_id_user unique (id, user_id),
  constraint tasks_list_same_user foreign key (list_id, user_id) references public.task_lists (id, user_id) on delete set null (list_id),
  constraint tasks_event_same_user foreign key (event_id, user_id) references public.events (id, user_id) on delete set null (event_id)
);
create index if not exists tasks_user_due on public.tasks (user_id, due_date) where completed_at is null;
select public.nl_apply_owner_policies('public.tasks');

alter table public.events
  drop constraint if exists events_task_same_user,
  add constraint events_task_same_user foreign key (task_id, user_id) references public.tasks (id, user_id) on delete set null (task_id);

create table if not exists public.subtasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  done boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- a subtarefa só pode pertencer a uma tarefa do mesmo usuário
  constraint subtasks_task_same_user foreign key (task_id, user_id) references public.tasks (id, user_id) on delete cascade
);
create index if not exists subtasks_task on public.subtasks (task_id);
select public.nl_apply_owner_policies('public.subtasks');
