import { expandEvents } from './recurrence';
import { addDaysKey, toDateKey, toTimeOfDay, weekdayOfKey, zonedToUtc } from './time';
import { isScheduledOn, isCompletedOn, logsByDate } from './habits';
import type { CalendarEvent, Habit, HabitLog, NotificationPrefs, Task, WorkoutRoutine } from './types';

export type ReminderKind = 'events' | 'tasks' | 'habits' | 'workouts';

export interface PlannedNotification {
  id: string; // determinístico: mesmo conteúdo + horário => mesmo id (evita duplicadas)
  kind: ReminderKind;
  title: string;
  body: string;
  fireAt: Date;
  data: { kind: ReminderKind; refId: string };
}

export interface PlanInput {
  now: Date;
  tz: string;
  prefs: NotificationPrefs;
  events: CalendarEvent[];
  tasks: Task[];
  habits: Habit[];
  habitLogs: HabitLog[];
  routines: WorkoutRoutine[];
  horizonDays?: number;
  limit?: number; // iOS permite no máximo 64 notificações locais pendentes
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function make(kind: ReminderKind, refId: string, title: string, body: string, fireAt: Date): PlannedNotification {
  return { id: `nl-${kind}-${hash(`${refId}|${title}|${body}|${fireAt.toISOString()}`)}`, kind, title, body, fireAt, data: { kind, refId } };
}

function leadText(min: number): string {
  if (min === 0) return 'agora';
  if (min < 60) return `em ${min} min`;
  if (min % 1440 === 0) return min === 1440 ? 'amanhã' : `em ${min / 1440} dias`;
  return `em ${Math.round(min / 60)} h`;
}

export function planNotifications(input: PlanInput): PlannedNotification[] {
  const { now, tz, prefs } = input;
  const horizon = new Date(now.getTime() + (input.horizonDays ?? 7) * 86_400_000);
  const out: PlannedNotification[] = [];
  const hm = (d: Date) => toTimeOfDay(d, tz);

  if (prefs.events) {
    for (const o of expandEvents(input.events, now, new Date(horizon.getTime() + 7 * 86_400_000))) {
      const min = o.event.reminderMinutes;
      if (min == null) continue;
      const fireAt = new Date(o.start.getTime() - min * 60_000);
      if (fireAt <= now || fireAt > horizon) continue;
      const label = o.event.category === 'meeting' ? 'Reunião' : 'Compromisso';
      out.push(make('events', o.key, o.event.title, `${label} ${leadText(min)} · ${o.event.allDay ? 'dia inteiro' : hm(o.start)}`, fireAt));
    }
  }

  if (prefs.tasks) {
    for (const t of input.tasks) {
      if (t.completedAt || !t.dueDate || t.reminderMinutes == null) continue;
      const due = zonedToUtc(t.dueDate, t.dueTime ?? '09:00', tz);
      const fireAt = new Date(due.getTime() - t.reminderMinutes * 60_000);
      if (fireAt <= now || fireAt > horizon) continue;
      out.push(make('tasks', t.id, t.title, t.dueTime ? `Tarefa para as ${t.dueTime}` : 'Tarefa para hoje', fireAt));
    }
  }

  const today = toDateKey(now, tz);
  if (prefs.habits) {
    for (const h of input.habits) {
      if (h.archivedAt || !h.reminderEnabled || !h.time) continue;
      const map = logsByDate(input.habitLogs, h.id);
      for (let i = 0; i < (input.horizonDays ?? 7); i++) {
        const key = addDaysKey(today, i);
        if (!isScheduledOn(h, key) || isCompletedOn(h, map, key)) continue;
        const fireAt = zonedToUtc(key, h.time, tz);
        if (fireAt <= now) continue;
        out.push(make('habits', `${h.id}:${key}`, h.name, 'Hora do seu hábito', fireAt));
      }
    }
  }

  if (prefs.workouts) {
    for (const r of input.routines) {
      if (!r.scheduleTime || !r.scheduleWeekdays.length) continue;
      for (let i = 0; i < (input.horizonDays ?? 7); i++) {
        const key = addDaysKey(today, i);
        if (!r.scheduleWeekdays.includes(weekdayOfKey(key))) continue;
        const fireAt = zonedToUtc(key, r.scheduleTime, tz);
        if (fireAt <= now) continue;
        out.push(make('workouts', `${r.id}:${key}`, `Treino: ${r.name}`, `Programado para ${r.scheduleTime}`, fireAt));
      }
    }
  }

  const unique = new Map(out.map((n) => [n.id, n]));
  return [...unique.values()].sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime()).slice(0, input.limit ?? 60);
}

/** Diferença entre o que está agendado no aparelho e o plano desejado. */
export function diffSchedule(scheduledIds: string[], plan: PlannedNotification[]): { toCancel: string[]; toSchedule: PlannedNotification[] } {
  const wanted = new Set(plan.map((p) => p.id));
  const have = new Set(scheduledIds);
  return {
    toCancel: scheduledIds.filter((id) => id.startsWith('nl-') && !wanted.has(id)),
    toSchedule: plan.filter((p) => !have.has(p.id)),
  };
}
