// Teste de integração do esquema: aplica as migrações reais num PostgreSQL embutido (PGlite)
// e verifica RLS, restrições e unicidade como o Supabase faria.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';

// Simula o que o Supabase provê: schema auth, auth.uid() lendo o JWT e os papéis.
const SUPABASE_STUB = `
  create schema if not exists auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;
  grant usage on schema public, auth to authenticated, anon, service_role;
  grant execute on function auth.uid() to authenticated, anon;
`;

let db: PGlite;

async function as<T>(userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${userId ?? ''}', false);`);
  await db.exec(userId ? 'set role authenticated' : 'set role anon');
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const dir = join(process.cwd(), 'supabase', 'migrations');
  for (const f of readdirSync(dir).filter((x: string) => x.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(dir, f), 'utf8'));
  }
  await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${ALICE}', 'alice@example.com', '{"display_name":"Alice"}'), ('${BOB}', 'bob@example.com', '{}');`);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe('migrações e perfil', () => {
  it('cria o perfil automaticamente no cadastro', async () => {
    const r = await db.query<{ display_name: string; timezone: string }>(`select display_name, timezone from public.profiles where id = '${ALICE}'`);
    expect(r.rows[0]).toEqual({ display_name: 'Alice', timezone: 'America/Recife' });
  });
});

describe('Row Level Security', () => {
  it('cada usuário só vê os próprios dados', async () => {
    await as(ALICE, () => db.query(`insert into public.tasks (title) values ('Tarefa da Alice')`));
    await as(BOB, () => db.query(`insert into public.tasks (title) values ('Tarefa do Bob')`));
    const alice = await as(ALICE, () => db.query<{ title: string }>('select title from public.tasks'));
    const bob = await as(BOB, () => db.query<{ title: string }>('select title from public.tasks'));
    expect(alice.rows.map((r) => r.title)).toEqual(['Tarefa da Alice']);
    expect(bob.rows.map((r) => r.title)).toEqual(['Tarefa do Bob']);
  });

  it('não aceita user_id de outra pessoa enviado pelo cliente', async () => {
    await expect(as(BOB, () => db.query(`insert into public.tasks (user_id, title) values ('${ALICE}', 'Invasão')`))).rejects.toThrow(/row-level security/);
  });

  it('não permite alterar nem apagar dados de outro usuário', async () => {
    const upd = await as(BOB, () => db.query(`update public.tasks set title = 'hackeado' where title = 'Tarefa da Alice'`));
    expect(upd.affectedRows).toBe(0);
    const del = await as(BOB, () => db.query(`delete from public.tasks where title = 'Tarefa da Alice'`));
    expect(del.affectedRows).toBe(0);
    const still = await db.query<{ n: number }>(`select count(*)::int as n from public.tasks where title = 'Tarefa da Alice'`);
    expect(still.rows[0].n).toBe(1);
  });

  it('não permite pendurar subtarefa em tarefa de outro usuário', async () => {
    const t = await as(ALICE, () => db.query<{ id: string }>(`select id from public.tasks limit 1`));
    await expect(as(BOB, () => db.query(`insert into public.subtasks (task_id, title) values ('${t.rows[0].id}', 'x')`))).rejects.toThrow();
  });

  it('usuário anônimo não lê nada', async () => {
    await expect(as(null, () => db.query('select * from public.tasks'))).rejects.toThrow(/permission denied/);
  });

  it('tokens de integração são inacessíveis pela API, até para o dono', async () => {
    await db.query(`insert into public.integration_secrets (user_id, provider, access_token_enc) values ('${ALICE}', 'google_calendar', 'cifrado')`);
    await expect(as(ALICE, () => db.query('select * from public.integration_secrets'))).rejects.toThrow(/permission denied/);
  });
});

describe('restrições de integridade', () => {
  it('um registro de hábito por dia', async () => {
    await as(ALICE, async () => {
      const h = await db.query<{ id: string }>(`insert into public.habits (name) values ('Ler') returning id`);
      await db.query(`insert into public.habit_logs (habit_id, date) values ('${h.rows[0].id}', '2026-10-29')`);
      await expect(db.query(`insert into public.habit_logs (habit_id, date) values ('${h.rows[0].id}', '2026-10-29')`)).rejects.toThrow(/habit_logs_one_per_day/);
    });
  });

  it('valores monetários positivos e transferência entre contas distintas', async () => {
    await as(ALICE, async () => {
      const a = await db.query<{ id: string }>(`insert into public.finance_accounts (name) values ('Conta') returning id`);
      await expect(db.query(`insert into public.transactions (type, amount_cents, date) values ('expense', -10, '2026-10-29')`)).rejects.toThrow();
      await expect(db.query(`insert into public.transactions (type, amount_cents, date, account_id, transfer_account_id) values ('transfer', 100, '2026-10-29', '${a.rows[0].id}', '${a.rows[0].id}')`)).rejects.toThrow(/transactions_transfer_accounts/);
      const ok = await db.query(`insert into public.transactions (type, amount_cents, date, account_id, category) values ('expense', 3500, '2026-10-29', '${a.rows[0].id}', 'Alimentação')`);
      expect(ok.affectedRows).toBe(1);
    });
  });

  it('evento precisa terminar depois de começar e não duplica id externo', async () => {
    await as(ALICE, async () => {
      await expect(db.query(`insert into public.events (title, start_at, end_at) values ('x', '2026-10-29T15:00Z', '2026-10-29T14:00Z')`)).rejects.toThrow(/events_range/);
      await db.query(`insert into public.events (title, start_at, end_at, external_id) values ('g', '2026-10-29T15:00Z', '2026-10-29T16:00Z', 'google-1')`);
      await expect(db.query(`insert into public.events (title, start_at, end_at, external_id) values ('g2', '2026-10-29T15:00Z', '2026-10-29T16:00Z', 'google-1')`)).rejects.toThrow(/events_external_unique/);
    });
  });

  it('limite diário do assistente é atômico', async () => {
    const r1 = await db.query<{ ok: boolean }>(`select public.increment_assistant_usage('${ALICE}', 'request', 2) as ok`);
    const r2 = await db.query<{ ok: boolean }>(`select public.increment_assistant_usage('${ALICE}', 'request', 2) as ok`);
    const r3 = await db.query<{ ok: boolean }>(`select public.increment_assistant_usage('${ALICE}', 'request', 2) as ok`);
    expect([r1.rows[0].ok, r2.rows[0].ok, r3.rows[0].ok]).toEqual([true, true, false]);
    await expect(as(ALICE, () => db.query(`select public.increment_assistant_usage('${ALICE}', 'request', 999)`))).rejects.toThrow(/permission denied/);
  });

  it('excluir a conta apaga os dados em cascata', async () => {
    await db.query(`delete from auth.users where id = '${BOB}'`);
    const r = await db.query<{ n: number }>(`select count(*)::int as n from public.tasks where user_id = '${BOB}'`);
    expect(r.rows[0].n).toBe(0);
  });
});
