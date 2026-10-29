-- Northline · 0003 · Hábitos e treinos.

create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text check (char_length(description) <= 1000),
  icon text not null default 'check',
  frequency text not null default 'daily' check (frequency in ('daily', 'weekly')),
  weekdays smallint[] not null default '{0,1,2,3,4,5,6}' check (weekdays <@ '{0,1,2,3,4,5,6}'::smallint[]),
  daily_target integer not null default 1 check (daily_target between 1 and 100),
  weekly_target integer check (weekly_target is null or weekly_target between 1 and 7),
  time time,
  reminder_enabled boolean not null default false,
  start_date date not null default current_date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint habits_id_user unique (id, user_id),
  constraint habits_weekly_target check (frequency = 'daily' or weekly_target is not null)
);
select public.nl_apply_owner_policies('public.habits');

create table if not exists public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id uuid not null,
  date date not null,
  count integer not null default 1 check (count between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint habit_logs_habit_same_user foreign key (habit_id, user_id) references public.habits (id, user_id) on delete cascade,
  -- um registro por hábito e dia: evita duplicidade
  constraint habit_logs_one_per_day unique (habit_id, date)
);
create index if not exists habit_logs_user_date on public.habit_logs (user_id, date);
select public.nl_apply_owner_policies('public.habit_logs');

create table if not exists public.workout_routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  notes text check (char_length(notes) <= 2000),
  muscle_groups text[] not null default '{}',
  schedule_weekdays smallint[] not null default '{}' check (schedule_weekdays <@ '{0,1,2,3,4,5,6}'::smallint[]),
  schedule_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workout_routines_id_user unique (id, user_id)
);
select public.nl_apply_owner_policies('public.workout_routines');

create table if not exists public.routine_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  routine_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  muscle_group text not null default '',
  sets integer not null default 3 check (sets between 1 and 50),
  reps integer not null default 10 check (reps between 0 and 1000),
  weight_kg numeric(6, 2) check (weight_kg is null or weight_kg between 0 and 2000),
  rest_seconds integer check (rest_seconds is null or rest_seconds between 0 and 3600),
  notes text check (char_length(notes) <= 1000),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint routine_exercises_same_user foreign key (routine_id, user_id) references public.workout_routines (id, user_id) on delete cascade
);
select public.nl_apply_owner_policies('public.routine_exercises');

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  routine_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_minutes integer check (duration_minutes is null or duration_minutes between 0 and 1440),
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workout_sessions_id_user unique (id, user_id),
  constraint workout_sessions_routine_same_user foreign key (routine_id, user_id) references public.workout_routines (id, user_id) on delete set null (routine_id),
  constraint workout_sessions_range check (ended_at is null or ended_at >= started_at)
);
create index if not exists workout_sessions_user_started on public.workout_sessions (user_id, started_at desc);
select public.nl_apply_owner_policies('public.workout_sessions');

create table if not exists public.session_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null,
  exercise_name text not null check (char_length(btrim(exercise_name)) between 1 and 80),
  muscle_group text not null default '',
  set_index integer not null check (set_index between 1 and 100),
  reps integer not null default 0 check (reps between 0 and 1000),
  weight_kg numeric(6, 2) check (weight_kg is null or weight_kg between 0 and 2000),
  done boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_sets_same_user foreign key (session_id, user_id) references public.workout_sessions (id, user_id) on delete cascade
);
create index if not exists session_sets_session on public.session_sets (session_id);
select public.nl_apply_owner_policies('public.session_sets');
