import { describe, expect, it } from 'vitest';
import { interpretLocally, type LocalContext } from '@/domain/assistant-local';
import { fromRow, toRow } from '@/data/mapping';
import { TABLES } from '@/data/collections';
import { decidePull, decidePush, fromRRule, remoteRange, toRRule, type LocalEventState } from '../supabase/functions/_shared/sync-logic';
import { zonedToUtc } from '@/domain/time';
import type { CalendarEvent, Habit, Task } from '@/domain/types';

const tz = 'America/Recife';
const now = zonedToUtc('2026-10-29', '10:00', tz);
let seq = 0;
const newId = () => `p-${++seq}`;
const iso = now.toISOString();

function event(title: string, date: string, start: string, minutes = 60, extra: Partial<CalendarEvent> = {}): CalendarEvent {
  const s = zonedToUtc(date, start, tz);
  return {
    id: newId(), title, description: null, startAt: s.toISOString(), endAt: new Date(s.getTime() + minutes * 60_000).toISOString(), allDay: false, timezone: tz, location: null, meetingUrl: null,
    category: 'meeting', color: null, reminderMinutes: 10, recurrence: null, recurrenceExceptions: [], recurringEventId: null, originalStartAt: null, status: 'confirmed',
    source: 'northline', externalId: null, externalEtag: null, syncStatus: 'local', taskId: null, createdAt: iso, updatedAt: iso, ...extra,
  };
}

function ctx(p: Partial<LocalContext> = {}): LocalContext {
  return { now, tz, events: [], tasks: [], habits: [], habitLogs: [], transactions: [], accounts: [], routines: [], sessions: [], defaultReminderMinutes: 10, pending: null, newId, ...p };
}

describe('assistente local: prévia, confirmação e ambiguidades', () => {
  it('cria prévia de compromisso com data completa, sem salvar nada', () => {
    const r = interpretLocally('Marca uma reunião amanhã às 15h', ctx());
    expect(r.proposals).toHaveLength(1);
    const p = r.proposals[0];
    expect(p.kind).toBe('create_event');
    if (p.kind !== 'create_event') return;
    expect(p.draft).toMatchObject({ title: 'Reunião', date: '2026-10-30', startTime: '15:00', durationMinutes: 60, category: 'meeting' });
    expect(p.summary).toContain('sexta-feira, 30 de outubro de 2026');
  });

  it('pergunta o horário quando o usuário diz só "à tarde" e completa com a resposta', () => {
    const first = interpretLocally('Marca uma reunião amanhã à tarde', ctx());
    expect(first.proposals).toHaveLength(0);
    expect(first.reply).toMatch(/Qual horário/);
    expect(first.pending?.missing).toBe('time');
    const second = interpretLocally('16h', ctx({ pending: first.pending }));
    expect(second.proposals[0]).toMatchObject({ kind: 'create_event', draft: { date: '2026-10-30', startTime: '16:00' } });
  });

  it('avisa sobre conflito antes de confirmar', () => {
    const r = interpretLocally('Marca uma reunião amanhã às 15h', ctx({ events: [event('Dentista', '2026-10-30', '14:30')] }));
    const p = r.proposals[0];
    expect(p.kind === 'create_event' && p.conflicts.map((c) => c.title)).toEqual(['Dentista']);
    expect(r.reply).toMatch(/conflito/i);
  });

  it('identifica o evento certo ao remarcar', () => {
    const meeting = event('Reunião com a equipe', '2026-10-29', '14:00');
    const r = interpretLocally('Muda minha reunião para as 16h', ctx({ events: [meeting, event('Academia', '2026-10-29', '18:00', 60, { category: 'health' })] }));
    const p = r.proposals[0];
    expect(p.kind).toBe('update_event');
    if (p.kind !== 'update_event') return;
    expect(p.eventId).toBe(meeting.id);
    expect(p.after.startAt).toBe(zonedToUtc('2026-10-29', '16:00', tz).toISOString());
  });

  it('pede esclarecimento quando há vários compromissos parecidos', () => {
    const r = interpretLocally('Cancela a reunião', ctx({ events: [event('Reunião A', '2026-10-30', '09:00'), event('Reunião B', '2026-10-31', '09:00')] }));
    expect(r.proposals).toHaveLength(0);
    expect(r.reply).toMatch(/Qual deles/);
  });

  it('registra gasto em centavos com categoria inferida', () => {
    const r = interpretLocally('Anota que gastei 35 reais no almoço', ctx());
    expect(r.proposals[0]).toMatchObject({ kind: 'create_transaction', tx: { type: 'expense', amountCents: 3500, category: 'Alimentação', date: '2026-10-29' } });
  });

  it('pergunta o valor quando não foi informado', () => {
    const r = interpretLocally('Paguei a conta de luz', ctx());
    expect(r.pending?.missing).toBe('amount');
  });

  it('responde consultas com dados reais', () => {
    const tasks: Task[] = [{ id: 't1', title: 'Enviar relatório', description: null, dueDate: '2026-10-29', dueTime: null, priority: 'high', category: 'work', tags: [], listId: null, recurrence: null, reminderMinutes: null, completedAt: null, eventId: null, subtasks: [], createdAt: iso, updatedAt: iso }];
    expect(interpretLocally('Quais são minhas tarefas de hoje?', ctx({ tasks })).reply).toContain('Enviar relatório');
    const tx = [{ id: 'x', accountId: null, transferAccountId: null, type: 'expense' as const, amountCents: 12345, category: 'Lazer', description: null, date: '2026-10-05', paymentMethod: null, recurringId: null, createdAt: iso, updatedAt: iso }];
    expect(interpretLocally('Quanto gastei este mês?', ctx({ transactions: tx })).reply).toContain('R$ 123,45');
  });

  it('marca hábito pelo nome', () => {
    const h: Habit = { id: 'h1', name: 'Leitura', description: null, icon: 'book', frequency: 'daily', weekdays: [0, 1, 2, 3, 4, 5, 6], dailyTarget: 1, weeklyTarget: null, time: null, reminderEnabled: false, startDate: '2026-10-01', archivedAt: null, createdAt: iso, updatedAt: iso };
    expect(interpretLocally('Fiz minha leitura de hoje', ctx({ habits: [h] })).proposals[0]).toMatchObject({ kind: 'log_habit', habitId: 'h1', date: '2026-10-29' });
  });
});

describe('mapeamento app <-> Postgres', () => {
  it('converte camelCase/snake_case, separa filhos e não envia campos do servidor', () => {
    const task = { id: 't', title: 'X', dueTime: '09:30', subtasks: [{ id: 's', title: 'a', done: false, position: 0 }], createdAt: iso, updatedAt: iso };
    const { row, children } = toRow(task, TABLES.tasks);
    expect(row).toEqual({ id: 't', title: 'X', due_time: '09:30' });
    expect(children).toEqual([{ id: 's', title: 'a', done: false, position: 0, task_id: 't' }]);
    const back = fromRow<{ dueTime: string; subtasks: unknown[]; createdAt: string }>({ id: 't', user_id: 'u', due_time: '09:30:00', created_at: '2026-10-29T13:00:00+00:00', subtasks: [{ id: 's', task_id: 't', user_id: 'u', title: 'a', done: false, position: 0 }] }, TABLES.tasks);
    expect(back.dueTime).toBe('09:30');
    expect(back.createdAt).toBe('2026-10-29T13:00:00.000Z');
    expect(back.subtasks).toEqual([{ id: 's', title: 'a', done: false, position: 0 }]);
  });
});

describe('regras de sincronização com o Google', () => {
  const local = (p: Partial<LocalEventState> = {}): LocalEventState => ({ id: 'l', externalId: 'g1', externalEtag: '"1"', syncStatus: 'synced', status: 'confirmed', recurrence: null, ...p });
  it('importa novos, atualiza alterados e ignora inalterados', () => {
    expect(decidePull({ id: 'g9', etag: '"1"' }, undefined, new Set())).toBe('import');
    expect(decidePull({ id: 'g1', etag: '"2"' }, local(), new Set())).toBe('update_local');
    expect(decidePull({ id: 'g1', etag: '"1"' }, local(), new Set())).toBe('noop');
  });
  it('não sobrescreve em silêncio: mudança dos dois lados vira conflito', () => {
    expect(decidePull({ id: 'g1', etag: '"2"' }, local({ syncStatus: 'pending' }), new Set())).toBe('conflict');
    expect(decidePull({ id: 'g1', status: 'cancelled' }, local({ syncStatus: 'pending' }), new Set())).toBe('conflict');
  });
  it('propaga exclusões e ignora instâncias de séries criadas pelo Northline', () => {
    expect(decidePull({ id: 'g1', status: 'cancelled' }, local(), new Set())).toBe('delete_local');
    expect(decidePull({ id: 'g1_2026', recurringEventId: 'gs' }, undefined, new Set(['gs']))).toBe('skip');
  });
  it('decide o envio de alterações locais', () => {
    expect(decidePush(local({ syncStatus: 'pending', externalId: null }))).toBe('insert');
    expect(decidePush(local({ syncStatus: 'pending' }))).toBe('patch');
    expect(decidePush(local({ syncStatus: 'pending', status: 'cancelled' }))).toBe('delete_remote');
    expect(decidePush(local())).toBe('none');
  });
  it('converte recorrência e intervalos', () => {
    expect(toRRule({ freq: 'weekly', interval: 2, byWeekday: [1, 3], until: '2026-12-31' })).toBe('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20261231T235959Z');
    expect(fromRRule(['RRULE:FREQ=WEEKLY;BYDAY=TU,TH;COUNT=10'])).toEqual({ freq: 'weekly', interval: 1, byWeekday: [2, 4], until: null, count: 10 });
    expect(remoteRange({ id: 'x', start: { date: '2026-11-01' }, end: { date: '2026-11-02' } })).toEqual({ startAt: '2026-11-01T00:00:00.000Z', endAt: '2026-11-02T00:00:00.000Z', allDay: true });
  });
});

describe('regressões', () => {
  it('remove "à tarde" do título ao completar o horário', () => {
    const first = interpretLocally('Tenho consulta no dentista amanhã à tarde', ctx());
    const second = interpretLocally('15h30', ctx({ pending: first.pending }));
    expect(second.proposals[0]).toMatchObject({ kind: 'create_event', draft: { title: 'Consulta no dentista', startTime: '15:30', date: '2026-10-30' } });
  });
});
