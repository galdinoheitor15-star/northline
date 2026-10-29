-- Northline · 0004 · Finanças. Valores sempre em centavos inteiros (bigint).

create table if not exists public.finance_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  type text not null default 'checking' check (type in ('checking', 'savings', 'cash', 'credit', 'investment', 'other')),
  initial_balance_cents bigint not null default 0,
  archived_at timestamptz,
  -- reservado para futuras integrações bancárias autorizadas (Open Finance); não usado na v1
  provider text,
  provider_account_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_accounts_id_user unique (id, user_id)
);
select public.nl_apply_owner_policies('public.finance_accounts');

create table if not exists public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid,
  type text not null check (type in ('income', 'expense')),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 10000000000),
  category text not null check (char_length(category) between 1 and 60),
  description text check (char_length(description) <= 300),
  payment_method text,
  recurrence jsonb not null check (recurrence ? 'freq'),
  start_date date not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_transactions_id_user unique (id, user_id),
  constraint recurring_transactions_account_same_user foreign key (account_id, user_id) references public.finance_accounts (id, user_id) on delete set null (account_id)
);
select public.nl_apply_owner_policies('public.recurring_transactions');

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid,
  transfer_account_id uuid,
  type text not null check (type in ('income', 'expense', 'transfer')),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 10000000000),
  category text not null default 'Outros' check (char_length(category) between 1 and 60),
  description text check (char_length(description) <= 300),
  date date not null,
  payment_method text check (char_length(payment_method) <= 40),
  recurring_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_account_same_user foreign key (account_id, user_id) references public.finance_accounts (id, user_id) on delete set null (account_id),
  constraint transactions_transfer_same_user foreign key (transfer_account_id, user_id) references public.finance_accounts (id, user_id) on delete set null (transfer_account_id),
  constraint transactions_recurring_same_user foreign key (recurring_id, user_id) references public.recurring_transactions (id, user_id) on delete set null (recurring_id),
  constraint transactions_transfer_accounts check (type <> 'transfer' or (account_id is not null and transfer_account_id is not null and account_id <> transfer_account_id)),
  -- lançamentos recorrentes materializados uma única vez por data
  constraint transactions_recurring_once unique (recurring_id, date)
);
create index if not exists transactions_user_date on public.transactions (user_id, date desc);
select public.nl_apply_owner_policies('public.transactions');

create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  target_cents bigint not null check (target_cents > 0),
  target_date date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint savings_goals_id_user unique (id, user_id)
);
select public.nl_apply_owner_policies('public.savings_goals');

create table if not exists public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id uuid not null,
  amount_cents bigint not null check (amount_cents <> 0),
  date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goal_contributions_same_user foreign key (goal_id, user_id) references public.savings_goals (id, user_id) on delete cascade
);
select public.nl_apply_owner_policies('public.goal_contributions');
