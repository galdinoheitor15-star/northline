// Operações de negócio compartilhadas pelas telas e pelo assistente.
// Toda gravação passa por useData (otimista) -> repositório (Supabase com RLS ou armazenamento local).
import { detachOccurrence, draftRange, validateEventDraft, type EventDraft } from '@/domain/events';
import { applyCheck } from '@/domain/habits';
import type { Proposal } from '@/domain/proposals';
import { completeTask, uncompleteTask } from '@/domain/tasks';
import { toDateKey, toTimeOfDay } from '@/domain/time';
import type { CalendarEvent, Habit, Task, Transaction } from '@/domain/types';
import { newId, nowIso } from '@/lib/id';
import { useData } from './data';
import { useIntegrations } from './integrations';

const syncFlag = (ev: Pick<CalendarEvent, 'externalId'>): CalendarEvent['syncStatus'] => (ev.externalId || useIntegrations.getState().googleConnected ? 'pending' : 'local');

export function eventFromDraft(d: EventDraft, base?: Partial<CalendarEvent>): CalendarEvent {
  const { start, end } = draftRange(d);
  const ts = nowIso();
  const ev: CalendarEvent = {
    id: newId(),
    description: null,
    location: null,
    meetingUrl: null,
    color: null,
    recurrenceExceptions: [],
    recurringEventId: null,
    originalStartAt: null,
    status: 'confirmed',
    source: 'northline',
    externalId: null,
    externalEtag: null,
    syncStatus: 'local',
    taskId: null,
    createdAt: ts,
    ...base,
    title: d.title.trim(),
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    allDay: !!d.allDay,
    timezone: d.timezone,
    category: d.category,
    reminderMinutes: d.reminderMinutes,
    recurrence: d.recurrence,
    updatedAt: ts,
  };
  if (d.description !== undefined) ev.description = d.description?.trim() || null;
  if (d.location !== undefined) ev.location = d.location?.trim() || null;
  if (d.meetingUrl !== undefined) ev.meetingUrl = d.meetingUrl?.trim() || null;
  ev.syncStatus = syncFlag(ev);
  return ev;
}

export function draftFromEvent(ev: CalendarEvent, occurrence?: { start: Date; end: Date }): EventDraft {
  const start = occurrence?.start ?? new Date(ev.startAt);
  const end = occurrence?.end ?? new Date(ev.endAt);
  return {
    title: ev.title,
    description: ev.description,
    date: toDateKey(start, ev.timezone),
    startTime: toTimeOfDay(start, ev.timezone),
    endTime: toTimeOfDay(end, ev.timezone),
    durationMinutes: null,
    allDay: ev.allDay,
    timezone: ev.timezone,
    location: ev.location,
    meetingUrl: ev.meetingUrl,
    category: ev.category,
    reminderMinutes: ev.reminderMinutes,
    recurrence: ev.recurrence,
  };
}

export async function createEvent(d: EventDraft, base?: Partial<CalendarEvent>): Promise<CalendarEvent | null> {
  const v = validateEventDraft(d);
  if (!v.ok) throw new Error(Object.values(v.errors)[0]);
  const ev = eventFromDraft(d, base);
  return (await useData.getState().save('events', ev)) ? ev : null;
}

export type SeriesScope = 'single' | 'series';

/** Atualiza um evento; em séries, "single" desanexa a ocorrência num evento próprio. */
export async function updateEvent(ev: CalendarEvent, d: EventDraft, scope: SeriesScope, occurrenceStart?: Date): Promise<boolean> {
  const v = validateEventDraft(d);
  if (!v.ok) throw new Error(Object.values(v.errors)[0]);
  const data = useData.getState();
  if (ev.recurrence && scope === 'single' && occurrenceStart) {
    const { series } = detachOccurrence(ev, occurrenceStart);
    const single = eventFromDraft({ ...d, recurrence: null }, { recurringEventId: ev.id, originalStartAt: occurrenceStart.toISOString(), source: ev.source, taskId: ev.taskId });
    return data.save('events', [{ ...series, updatedAt: nowIso(), syncStatus: syncFlag(series) }, single]);
  }
  if (ev.recurrence && scope === 'series' && occurrenceStart) {
    // desloca a série inteira pela mesma diferença aplicada à ocorrência editada
    const { start: newStart, end: newEnd } = draftRange(d);
    const seriesStart = new Date(ev.startAt);
    const deltaTime = newStart.getTime() - occurrenceStart.getTime();
    const start = new Date(seriesStart.getTime() + deltaTime);
    const end = new Date(start.getTime() + (newEnd.getTime() - newStart.getTime()));
    const updated = { ...eventFromDraft(d, ev), id: ev.id, createdAt: ev.createdAt, startAt: start.toISOString(), endAt: end.toISOString(), recurrenceExceptions: ev.recurrenceExceptions };
    return data.save('events', updated);
  }
  const updated = { ...eventFromDraft(d, ev), id: ev.id, createdAt: ev.createdAt };
  return data.save('events', updated);
}

/** Cancela uma ocorrência (exceção na série) ou o evento inteiro. Eventos sincronizados viram "cancelled" para propagar ao Google. */
export async function cancelEvent(ev: CalendarEvent, scope: SeriesScope, occurrenceStart?: Date | null): Promise<boolean> {
  const data = useData.getState();
  if (ev.recurrence && scope === 'single' && occurrenceStart) {
    const { series } = detachOccurrence(ev, occurrenceStart);
    return data.save('events', { ...series, updatedAt: nowIso(), syncStatus: syncFlag(series) });
  }
  const overrides = data.events.filter((e) => e.recurringEventId === ev.id);
  if (ev.externalId) {
    return data.save('events', [ev, ...overrides].map((e) => ({ ...e, status: 'cancelled' as const, syncStatus: 'pending' as const, updatedAt: nowIso() })));
  }
  return data.remove('events', [ev.id, ...overrides.map((o) => o.id)]);
}

export async function toggleTask(task: Task): Promise<void> {
  const data = useData.getState();
  if (task.completedAt) {
    await data.save('tasks', uncompleteTask(task, nowIso()));
    return;
  }
  const tz = data.profile.timezone;
  const { updated, next } = completeTask(task, nowIso(), toDateKey(new Date(), tz), newId, data.tasks);
  await data.save('tasks', next ? [updated, next] : [updated]);
}

/** Converte tarefa em compromisso, vinculando os dois registros (sem duplicar se já existir). */
export async function convertTaskToEvent(task: Task, durationMinutes = 60): Promise<CalendarEvent | null> {
  const data = useData.getState();
  if (task.eventId) return data.events.find((e) => e.id === task.eventId) ?? null;
  if (!task.dueDate || !task.dueTime) throw new Error('Defina data e horário da tarefa antes de converter.');
  const ev = await createEvent(
    { title: task.title, description: task.description, date: task.dueDate, startTime: task.dueTime, durationMinutes, timezone: data.profile.timezone, category: task.category, reminderMinutes: task.reminderMinutes, recurrence: null },
    { source: 'task', taskId: task.id },
  );
  if (ev) await data.save('tasks', { ...task, eventId: ev.id, updatedAt: nowIso() });
  return ev;
}

export async function checkHabit(h: Habit, date: string): Promise<void> {
  const data = useData.getState();
  await data.save('habitLogs', applyCheck(data.habitLogs, h, date, nowIso(), newId));
}

export async function uncheckHabit(h: Habit, date: string): Promise<void> {
  const data = useData.getState();
  const log = data.habitLogs.find((l) => l.habitId === h.id && l.date === date);
  if (!log) return;
  if (log.count > 1) await data.save('habitLogs', { ...log, count: log.count - 1, updatedAt: nowIso() });
  else await data.remove('habitLogs', log.id);
}

export function newTransaction(p: Partial<Transaction> & Pick<Transaction, 'type' | 'amountCents' | 'date'>): Transaction {
  const ts = nowIso();
  return { id: newId(), accountId: null, transferAccountId: null, category: 'Outros', description: null, paymentMethod: null, recurringId: null, createdAt: ts, updatedAt: ts, ...p };
}

export interface ExecutionResult {
  ok: boolean;
  message: string;
  /** rota a abrir após executar (ex.: registro de treino) */
  navigate?: string;
}

/**
 * Executa uma proposta do assistente SOMENTE após confirmação explícita do usuário.
 * Os dados são revalidados aqui; o resultado só é "sucesso" se a gravação foi aceita.
 */
export async function executeProposal(p: Proposal): Promise<ExecutionResult> {
  const data = useData.getState();
  try {
    switch (p.kind) {
      case 'create_event': {
        const ev = await createEvent(p.draft, { source: 'assistant' });
        return ev ? { ok: true, message: `Compromisso "${ev.title}" salvo.` } : { ok: false, message: 'Não foi possível salvar o compromisso.' };
      }
      case 'update_event': {
        const ev = data.events.find((e) => e.id === p.eventId);
        if (!ev) return { ok: false, message: 'O compromisso não existe mais.' };
        const start = new Date(p.after.startAt);
        const end = new Date(p.after.endAt);
        const d = { ...draftFromEvent(ev), date: toDateKey(start, ev.timezone), startTime: toTimeOfDay(start, ev.timezone), endTime: toTimeOfDay(end, ev.timezone), durationMinutes: null };
        const ok = await updateEvent(ev, d, 'single', p.occurrenceStart ? new Date(p.occurrenceStart) : undefined);
        return ok ? { ok: true, message: `"${ev.title}" atualizado.` } : { ok: false, message: 'Não foi possível atualizar.' };
      }
      case 'cancel_event': {
        const ev = data.events.find((e) => e.id === p.eventId);
        if (!ev) return { ok: false, message: 'O compromisso não existe mais.' };
        const ok = await cancelEvent(ev, 'single', p.occurrenceStart ? new Date(p.occurrenceStart) : null);
        return ok ? { ok: true, message: `"${ev.title}" cancelado.` } : { ok: false, message: 'Não foi possível cancelar.' };
      }
      case 'create_task': {
        const ts = nowIso();
        const t: Task = { id: newId(), description: null, tags: [], listId: null, recurrence: null, completedAt: null, eventId: null, subtasks: [], createdAt: ts, updatedAt: ts, ...p.task, title: p.task.title.trim() };
        if (!t.title) return { ok: false, message: 'Título vazio.' };
        const ok = await data.save('tasks', t);
        return ok ? { ok: true, message: `Tarefa "${t.title}" criada.` } : { ok: false, message: 'Não foi possível criar a tarefa.' };
      }
      case 'create_transaction': {
        if (!Number.isInteger(p.tx.amountCents) || p.tx.amountCents <= 0) return { ok: false, message: 'Valor inválido.' };
        const ok = await data.save('transactions', newTransaction({ ...p.tx, paymentMethod: null }));
        return ok ? { ok: true, message: 'Lançamento registrado.' } : { ok: false, message: 'Não foi possível registrar.' };
      }
      case 'log_habit': {
        const h = data.habits.find((x) => x.id === p.habitId);
        if (!h) return { ok: false, message: 'Hábito não encontrado.' };
        await checkHabit(h, p.date);
        return { ok: true, message: `"${h.name}" registrado.` };
      }
      case 'log_workout':
        return { ok: true, message: 'Abrindo registro de treino.', navigate: p.routineId ? `/workouts/session?routineId=${p.routineId}` : '/workouts/session' };
    }
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
