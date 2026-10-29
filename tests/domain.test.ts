import { describe, expect, it } from 'vitest';
import { addDaysKey, addMonthsKey, endOfDayUtc, formatLongDate, startOfDayUtc, toDateKey, zonedToUtc } from '@/domain/time';
import { expandDates, expandEvents, nextDate } from '@/domain/recurrence';
import { detachOccurrence, draftRange, findConflicts, freeSlots, validateEventDraft, type EventDraft } from '@/domain/events';
import { applyCheck, computeStreak, habitsTodaySummary } from '@/domain/habits';
import { accountBalance, expensesByCategory, formatBRL, goalProgress, materializeRecurring, parseMoneyToCents, percentChange, periodTotals, totalBalance, validateTransaction } from '@/domain/finance';
import { completeTask, daySummary, isOverdue } from '@/domain/tasks';
import { diffSchedule, planNotifications } from '@/domain/notifications-plan';
import { lastPerformance, nextScheduledWorkout, setsFromRoutine } from '@/domain/workouts';
import type { CalendarEvent, FinanceAccount, Habit, HabitLog, Task, Transaction, WorkoutRoutine, WorkoutSession } from '@/domain/types';

const tz = 'America/Recife';
const iso = '2026-10-29T13:00:00.000Z';
let seq = 0;
const newId = () => `id-${++seq}`;

function event(p: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: newId(), title: 'Evento', description: null, startAt: iso, endAt: iso, allDay: false, timezone: tz, location: null, meetingUrl: null,
    category: 'personal', color: null, reminderMinutes: null, recurrence: null, recurrenceExceptions: [], recurringEventId: null, originalStartAt: null,
    status: 'confirmed', source: 'northline', externalId: null, externalEtag: null, syncStatus: 'local', taskId: null, createdAt: iso, updatedAt: iso, ...p,
  };
}

describe('fuso horário', () => {
  it('converte horário local de Recife (UTC−3) para UTC', () => {
    expect(zonedToUtc('2026-10-29', '15:00', tz).toISOString()).toBe('2026-10-29T18:00:00.000Z');
    expect(toDateKey(new Date('2026-10-30T02:30:00Z'), tz)).toBe('2026-10-29');
  });

  it('respeita horário de verão em outros fusos (Nova York)', () => {
    // 1/11/2026 termina o horário de verão nos EUA
    expect(zonedToUtc('2026-10-31', '09:00', 'America/New_York').toISOString()).toBe('2026-10-31T13:00:00.000Z');
    expect(zonedToUtc('2026-11-02', '09:00', 'America/New_York').toISOString()).toBe('2026-11-02T14:00:00.000Z');
  });

  it('aritmética de datas e formatação por extenso', () => {
    expect(addDaysKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addMonthsKey('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsKey('2026-01-31', 1, false)).toBeNull();
    expect(formatLongDate('2026-10-30')).toBe('sexta-feira, 30 de outubro de 2026');
  });
});

describe('recorrência', () => {
  it('semanal em dias específicos', () => {
    expect(expandDates('2026-11-02', { freq: 'weekly', interval: 1, byWeekday: [1, 3] }, '2026-11-01', '2026-11-15')).toEqual(['2026-11-02', '2026-11-04', '2026-11-09', '2026-11-11']);
  });
  it('quinzenal, com limite de ocorrências e data final', () => {
    expect(expandDates('2026-11-03', { freq: 'weekly', interval: 2 }, '2026-11-01', '2026-12-31')).toEqual(['2026-11-03', '2026-11-17', '2026-12-01', '2026-12-15', '2026-12-29']);
    expect(expandDates('2026-11-01', { freq: 'daily', interval: 1, count: 3 }, '2026-11-01', '2026-11-30')).toHaveLength(3);
    expect(expandDates('2026-11-01', { freq: 'daily', interval: 1, until: '2026-11-04' }, '2026-11-01', '2026-11-30')).toHaveLength(4);
  });
  it('mensal no dia 31 pula meses sem esse dia', () => {
    expect(expandDates('2026-01-31', { freq: 'monthly', interval: 1 }, '2026-01-01', '2026-06-30')).toEqual(['2026-01-31', '2026-03-31', '2026-05-31']);
  });
  it('próxima data', () => {
    expect(nextDate('2026-10-29', { freq: 'weekly', interval: 1 }, '2026-10-29')).toBe('2026-11-05');
  });
  it('expande série, mantém horário local e respeita exceções e ocorrências editadas', () => {
    const start = zonedToUtc('2026-11-03', '19:00', tz);
    const series = event({ title: 'Inglês', startAt: start.toISOString(), endAt: new Date(start.getTime() + 3600_000).toISOString(), recurrence: { freq: 'weekly', interval: 1 } });
    const second = zonedToUtc('2026-11-10', '19:00', tz);
    const { series: edited } = detachOccurrence(series, second);
    const moved = event({ title: 'Inglês (remarcado)', startAt: zonedToUtc('2026-11-11', '19:00', tz).toISOString(), endAt: zonedToUtc('2026-11-11', '20:00', tz).toISOString(), recurringEventId: series.id, originalStartAt: second.toISOString() });
    const occ = expandEvents([edited, moved], startOfDayUtc('2026-11-01', tz), endOfDayUtc('2026-11-20', tz));
    expect(occ.map((o) => toDateKey(o.start, tz))).toEqual(['2026-11-03', '2026-11-11', '2026-11-17']);
    expect(occ[0].start.toISOString()).toBe('2026-11-03T22:00:00.000Z');
  });
});

describe('validação e conflitos de eventos', () => {
  const base: EventDraft = { title: 'Reunião', date: '2026-10-30', startTime: '14:00', durationMinutes: 60, timezone: tz, category: 'meeting', reminderMinutes: 10, recurrence: null };
  it('valida campos obrigatórios e intervalo', () => {
    expect(validateEventDraft(base).ok).toBe(true);
    expect(validateEventDraft({ ...base, title: '  ' }).errors.title).toBeDefined();
    expect(validateEventDraft({ ...base, date: '2026-02-30' }).errors.date).toBeDefined();
    expect(validateEventDraft({ ...base, startTime: '25:00' }).errors.startTime).toBeDefined();
    expect(validateEventDraft({ ...base, meetingUrl: 'meet.google.com/x' }).errors.meetingUrl).toBeDefined();
  });
  it('término antes do início atravessa a meia-noite', () => {
    const r = draftRange({ ...base, startTime: '23:00', endTime: '01:00', durationMinutes: null });
    expect((r.end.getTime() - r.start.getTime()) / 60000).toBe(120);
  });
  it('detecta conflito e calcula horários livres', () => {
    const s = zonedToUtc('2026-10-30', '14:30', tz);
    const busy = event({ title: 'Dentista', startAt: s.toISOString(), endAt: new Date(s.getTime() + 3600_000).toISOString() });
    const { start, end } = draftRange(base);
    expect(findConflicts([busy], start, end).map((o) => o.event.title)).toEqual(['Dentista']);
    const occ = expandEvents([busy], startOfDayUtc('2026-10-30', tz), endOfDayUtc('2026-10-30', tz));
    const slots = freeSlots(occ, zonedToUtc('2026-10-30', '08:00', tz), zonedToUtc('2026-10-30', '18:00', tz));
    expect(slots).toHaveLength(2);
  });
});

describe('sequências de hábitos', () => {
  const habit: Habit = {
    id: 'h1', name: 'Ler', description: null, icon: 'book', frequency: 'daily', weekdays: [1, 2, 3, 4, 5], dailyTarget: 1, weeklyTarget: null,
    time: null, reminderEnabled: false, startDate: '2026-10-01', archivedAt: null, createdAt: iso, updatedAt: iso,
  };
  const log = (date: string, count = 1): HabitLog => ({ id: newId(), habitId: 'h1', date, count, createdAt: iso, updatedAt: iso });

  it('ignora fins de semana não programados e não quebra por hoje pendente', () => {
    // seg 26, ter 27, qua 28 feitos; hoje (qui 29) pendente; sex 23 feito; fim de semana não programado
    const logs = ['2026-10-23', '2026-10-26', '2026-10-27', '2026-10-28'].map((d) => log(d));
    const s = computeStreak(habit, logs, '2026-10-29');
    expect(s.current).toBe(4);
  });
  it('uma falha em dia programado zera a sequência atual, mas mantém a melhor', () => {
    const logs = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-26', '2026-10-27', '2026-10-28'].map((d) => log(d));
    const s = computeStreak(habit, logs, '2026-10-29');
    expect(s.current).toBe(3);
    expect(s.best).toBe(4);
  });
  it('vários cliques no mesmo dia não aumentam a sequência', () => {
    const logs = [log('2026-10-28', 5)];
    expect(computeStreak(habit, logs, '2026-10-29').current).toBe(1);
  });
  it('meta diária maior que 1 exige atingir a meta', () => {
    const h2 = { ...habit, dailyTarget: 3 };
    expect(computeStreak(h2, [log('2026-10-28', 2)], '2026-10-29').current).toBe(0);
  });
  it('um registro por hábito e dia (sem duplicar)', () => {
    const first = applyCheck([], habit, '2026-10-29', iso, newId);
    const again = applyCheck([first], { ...habit, dailyTarget: 1 }, '2026-10-29', iso, newId);
    expect(again.id).toBe(first.id);
    expect(again.count).toBe(1);
  });
  it('meta semanal conta semanas', () => {
    const weekly: Habit = { ...habit, frequency: 'weekly', weeklyTarget: 2, weekdays: [] };
    const logs = ['2026-10-13', '2026-10-15', '2026-10-20', '2026-10-22', '2026-10-27'].map((d) => log(d));
    expect(computeStreak(weekly, logs, '2026-10-29')).toMatchObject({ current: 2, unit: 'semanas' });
  });
  it('resumo de hoje', () => {
    expect(habitsTodaySummary([habit], [log('2026-10-29')], '2026-10-29')).toEqual({ scheduled: 1, done: 1, progress: 1 });
  });
});

describe('finanças em centavos', () => {
  const acc: FinanceAccount = { id: 'a1', name: 'Nubank', type: 'checking', initialBalanceCents: 100_00, archivedAt: null, createdAt: iso, updatedAt: iso };
  const acc2: FinanceAccount = { ...acc, id: 'a2', name: 'Poupança', initialBalanceCents: 0 };
  const tx = (p: Partial<Transaction>): Transaction => ({ id: newId(), accountId: 'a1', transferAccountId: null, type: 'expense', amountCents: 0, category: 'Outros', description: null, date: '2026-10-10', paymentMethod: null, recurringId: null, createdAt: iso, updatedAt: iso, ...p });
  const txs = [
    tx({ type: 'income', amountCents: 3000_00, category: 'Salário', date: '2026-10-05' }),
    tx({ amountCents: 35_10, category: 'Alimentação' }),
    tx({ amountCents: 30, category: 'Alimentação' }),
    tx({ amountCents: 1200_00, category: 'Moradia' }),
    tx({ type: 'transfer', amountCents: 500_00, transferAccountId: 'a2' }),
    tx({ amountCents: 99_90, date: '2026-09-15' }),
  ];
  it('converte texto em centavos sem erro de ponto flutuante', () => {
    expect(parseMoneyToCents('35')).toBe(3500);
    expect(parseMoneyToCents('0,10')).toBe(10);
    expect(parseMoneyToCents('1.234,56')).toBe(123456);
    expect(parseMoneyToCents('1234.56')).toBe(123456);
    expect(parseMoneyToCents('1.234')).toBe(123400);
    expect(parseMoneyToCents('abc')).toBeNull();
    expect(formatBRL(123456)).toBe('R$ 1.234,56');
    expect(formatBRL(-500)).toBe('−R$ 5,00');
  });
  it('saldos, totais e transferências', () => {
    expect(totalBalance([acc, acc2], txs)).toBe(100_00 + 3000_00 - 35_10 - 30 - 1200_00 - 99_90);
    expect(accountBalance(acc2, txs)).toBe(500_00);
    expect(accountBalance(acc, txs)).toBe(100_00 + 3000_00 - 35_10 - 30 - 1200_00 - 500_00 - 99_90);
    expect(periodTotals(txs, '2026-10-01', '2026-10-31')).toEqual({ income: 3000_00, expense: 1235_40, net: 1764_60, count: 4 });
    expect(expensesByCategory(txs, '2026-10-01', '2026-10-31')[0]).toMatchObject({ category: 'Moradia', cents: 1200_00 });
    expect(percentChange(200, 100)).toBe(1);
    expect(percentChange(200, 0)).toBeNull();
  });
  it('metas e recorrência idempotente', () => {
    expect(goalProgress({ id: 'g', name: 'Viagem', targetCents: 1000_00, targetDate: null, archivedAt: null, contributions: [{ id: 'c', amountCents: 250_00, date: '2026-10-01' }], createdAt: iso, updatedAt: iso }).progress).toBe(0.25);
    const rule = { id: 'r1', accountId: 'a1', type: 'expense' as const, amountCents: 55_90, category: 'Assinaturas', description: 'Streaming', paymentMethod: null, recurrence: { freq: 'monthly' as const, interval: 1 }, startDate: '2026-08-10', active: true, createdAt: iso, updatedAt: iso };
    const first = materializeRecurring([rule], [], '2026-10-29', iso, newId);
    expect(first.map((t) => t.date)).toEqual(['2026-08-10', '2026-09-10', '2026-10-10']);
    expect(materializeRecurring([rule], first, '2026-10-29', iso, newId)).toHaveLength(0);
  });
  it('validação', () => {
    expect(validateTransaction({ type: 'expense', amountCents: 0, accountId: null, transferAccountId: null, category: 'X', date: '2026-10-01' }).amount).toBeDefined();
    expect(validateTransaction({ type: 'transfer', amountCents: 10, accountId: 'a', transferAccountId: 'a', category: '', date: '2026-10-01' }).account).toBeDefined();
  });
});

describe('tarefas', () => {
  const task = (p: Partial<Task>): Task => ({ id: newId(), title: 'T', description: null, dueDate: null, dueTime: null, priority: 'medium', category: 'personal', tags: [], listId: null, recurrence: null, reminderMinutes: null, completedAt: null, eventId: null, subtasks: [], createdAt: iso, updatedAt: iso, ...p });
  it('atraso e resumo do dia', () => {
    const list = [task({ dueDate: '2026-10-29' }), task({ dueDate: '2026-10-29', completedAt: iso }), task({ dueDate: '2026-10-27' }), task({ dueDate: '2026-11-02' })];
    expect(isOverdue(list[2], '2026-10-29')).toBe(true);
    expect(isOverdue(task({ dueDate: '2026-10-29', dueTime: '09:00' }), '2026-10-29', '10:00')).toBe(true);
    expect(daySummary(list, '2026-10-29', (t) => (t.completedAt ? '2026-10-29' : null))).toEqual({ total: 3, done: 1, pending: 2, overdue: 1, progress: 1 / 3 });
  });
  it('concluir tarefa recorrente cria a próxima sem duplicar', () => {
    const t = task({ title: 'Regar plantas', dueDate: '2026-10-29', recurrence: { freq: 'weekly', interval: 1 }, subtasks: [{ id: 's', title: 'Varanda', done: true, position: 0 }] });
    const { updated, next } = completeTask(t, iso, '2026-10-29', newId, [t]);
    expect(updated.completedAt).toBe(iso);
    expect(next?.dueDate).toBe('2026-11-05');
    expect(next?.subtasks[0].done).toBe(false);
    expect(completeTask(t, iso, '2026-10-29', newId, [t, next!]).next).toBeNull();
  });
});

describe('plano de notificações', () => {
  const now = new Date(iso);
  const prefs = { events: true, tasks: true, habits: true, workouts: true };
  const s = zonedToUtc('2026-10-29', '15:00', tz);
  const ev = event({ title: 'Reunião', category: 'meeting', startAt: s.toISOString(), endAt: new Date(s.getTime() + 3600_000).toISOString(), reminderMinutes: 10 });
  const input = { now, tz, prefs, events: [ev], tasks: [], habits: [], habitLogs: [], routines: [] };
  it('agenda lembrete antes do evento com id determinístico', () => {
    const plan = planNotifications(input);
    expect(plan).toHaveLength(1);
    expect(plan[0].fireAt.toISOString()).toBe(zonedToUtc('2026-10-29', '14:50', tz).toISOString());
    expect(planNotifications(input)[0].id).toBe(plan[0].id);
  });
  it('alterar o evento troca o id; diff cancela o antigo', () => {
    const before = planNotifications(input);
    const moved = planNotifications({ ...input, events: [{ ...ev, startAt: zonedToUtc('2026-10-29', '16:00', tz).toISOString(), endAt: zonedToUtc('2026-10-29', '17:00', tz).toISOString() }] });
    const d = diffSchedule(before.map((p) => p.id), moved);
    expect(d.toCancel).toEqual([before[0].id]);
    expect(d.toSchedule).toHaveLength(1);
  });
  it('respeita preferências por categoria e ignora horários passados', () => {
    expect(planNotifications({ ...input, prefs: { ...prefs, events: false } })).toHaveLength(0);
    const past = zonedToUtc('2026-10-29', '09:00', tz);
    expect(planNotifications({ ...input, events: [{ ...ev, startAt: past.toISOString(), endAt: past.toISOString() }] })).toHaveLength(0);
  });
});

describe('treinos', () => {
  const routine: WorkoutRoutine = { id: 'r1', name: 'Treino A', notes: null, muscleGroups: ['Peito'], scheduleWeekdays: [1, 4], scheduleTime: '18:00', exercises: [{ id: 'e1', name: 'Supino', muscleGroup: 'Peito', sets: 3, reps: 10, weightKg: 40, restSeconds: 90, notes: null, position: 0 }], createdAt: iso, updatedAt: iso };
  const session: WorkoutSession = { id: 's1', routineId: 'r1', name: 'Treino A', startedAt: '2026-10-26T21:00:00Z', endedAt: '2026-10-26T22:00:00Z', durationMinutes: 60, notes: null, createdAt: iso, updatedAt: iso, sets: [{ id: 'x', exerciseName: 'Supino', muscleGroup: 'Peito', setIndex: 1, reps: 8, weightKg: 45, done: true, position: 0 }] };
  it('próximo treino e último desempenho', () => {
    expect(nextScheduledWorkout([routine], [session], new Date(iso), tz)).toMatchObject({ date: '2026-10-29', time: '18:00' });
    expect(lastPerformance([session], 'supino')).toMatchObject({ reps: 8, weightKg: 45 });
    expect(setsFromRoutine(routine, [session], newId).map((s) => s.weightKg)).toEqual([45, 45, 45]);
  });
});
