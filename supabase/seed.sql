-- Dados de DESENVOLVIMENTO (rodam apenas em `supabase db reset` no ambiente local).
-- Nunca aplique este arquivo em produção.
-- Usuário: demo@northline.dev / senha: northline-demo
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'demo@northline.dev',
        extensions.crypt('northline-demo', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Demo"}', now(), now())
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
values (gen_random_uuid(), 'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
        '{"sub":"d0000000-0000-4000-8000-000000000001","email":"demo@northline.dev"}', 'email', now(), now(), now())
on conflict do nothing;

insert into public.finance_accounts (id, user_id, name, type, initial_balance_cents)
values ('d0000000-0000-4000-8000-0000000000a1', 'd0000000-0000-4000-8000-000000000001', 'Conta (demo)', 'checking', 150000)
on conflict do nothing;

insert into public.transactions (user_id, account_id, type, amount_cents, category, description, date) values
  ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000a1', 'income', 420000, 'Salário', 'Salário (demo)', date_trunc('month', current_date)::date),
  ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000a1', 'expense', 3500, 'Alimentação', 'Almoço (demo)', current_date);

insert into public.tasks (user_id, title, due_date, priority) values
  ('d0000000-0000-4000-8000-000000000001', 'Tarefa de demonstração', current_date, 'high');

insert into public.events (user_id, title, start_at, end_at, category, reminder_minutes) values
  ('d0000000-0000-4000-8000-000000000001', 'Reunião (demo)', date_trunc('day', now()) + interval '18 hours', date_trunc('day', now()) + interval '19 hours', 'meeting', 10);

insert into public.habits (user_id, name, icon, weekdays) values
  ('d0000000-0000-4000-8000-000000000001', 'Ler 20 páginas (demo)', 'book', '{0,1,2,3,4,5,6}');
