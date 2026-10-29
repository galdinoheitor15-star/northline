import { addDaysKey, rangeKeys, startOfWeekKey, weekdayOfKey } from './time';
import type { DateKey, Habit, HabitLog } from './types';

export const HABIT_ICONS = ['book', 'dumbbell', 'droplet', 'moon', 'brain', 'pen', 'leaf', 'heart', 'sun', 'music', 'code', 'check'] as const;

export function logsByDate(logs: HabitLog[], habitId: string): Map<DateKey, number> {
  const map = new Map<DateKey, number>();
  for (const l of logs) if (l.habitId === habitId) map.set(l.date, (map.get(l.date) ?? 0) + l.count);
  return map;
}

/** Hábito diário: está programado nesse dia? Hábito semanal: qualquer dia conta. */
export function isScheduledOn(h: Habit, key: DateKey): boolean {
  if (key < h.startDate) return false;
  if (h.archivedAt && key > h.archivedAt.slice(0, 10)) return false;
  if (h.frequency === 'weekly') return true;
  return h.weekdays.length === 0 || h.weekdays.includes(weekdayOfKey(key));
}

export function isCompletedOn(h: Habit, map: Map<DateKey, number>, key: DateKey): boolean {
  return (map.get(key) ?? 0) >= Math.max(1, h.dailyTarget);
}

export interface StreakInfo {
  current: number;
  best: number;
  unit: 'dias' | 'semanas';
}

/**
 * Sequências calculadas sobre os dias programados (ou semanas, no caso de meta semanal).
 * - Dias futuros nunca contam como falha.
 * - O dia (ou semana) corrente ainda em aberto não quebra a sequência.
 * - Cliques repetidos no mesmo dia não aumentam a sequência: só conta se a meta diária foi atingida.
 */
export function computeStreak(h: Habit, logs: HabitLog[], today: DateKey, weekStartsOn: 0 | 1 = 1): StreakInfo {
  const map = logsByDate(logs, h.id);
  if (h.frequency === 'weekly') return weeklyStreak(h, map, today, weekStartsOn);

  // sequência atual: volta a partir de hoje (hoje pendente não quebra)
  let current = 0;
  let key = today;
  if (isScheduledOn(h, key) && !isCompletedOn(h, map, key)) key = addDaysKey(key, -1);
  for (let guard = 0; guard < 3660 && key >= h.startDate; guard++, key = addDaysKey(key, -1)) {
    if (!isScheduledOn(h, key)) continue;
    if (isCompletedOn(h, map, key)) current++;
    else break;
  }

  // melhor sequência: percorre do início até hoje
  let best = 0;
  let run = 0;
  for (const k of rangeKeys(h.startDate, today)) {
    if (!isScheduledOn(h, k)) continue;
    if (isCompletedOn(h, map, k)) {
      run++;
      best = Math.max(best, run);
    } else if (k !== today) {
      run = 0;
    }
  }
  return { current, best: Math.max(best, current), unit: 'dias' };
}

function weeklyStreak(h: Habit, map: Map<DateKey, number>, today: DateKey, weekStartsOn: 0 | 1): StreakInfo {
  const target = Math.max(1, h.weeklyTarget ?? 1);
  const weekDone = (weekStart: DateKey) => {
    let n = 0;
    for (let i = 0; i < 7; i++) {
      const k = addDaysKey(weekStart, i);
      if (k <= today && isCompletedOn(h, map, k)) n++;
    }
    return n >= target;
  };
  const thisWeek = startOfWeekKey(today, weekStartsOn);
  const firstWeek = startOfWeekKey(h.startDate, weekStartsOn);
  let current = 0;
  let w = thisWeek;
  if (!weekDone(w)) w = addDaysKey(w, -7);
  for (; w >= firstWeek; w = addDaysKey(w, -7)) {
    if (weekDone(w)) current++;
    else break;
  }
  let best = 0;
  let run = 0;
  for (let k = firstWeek; k <= thisWeek; k = addDaysKey(k, 7)) {
    if (weekDone(k)) {
      run++;
      best = Math.max(best, run);
    } else if (k !== thisWeek) run = 0;
  }
  return { current, best: Math.max(best, current), unit: 'semanas' };
}

/** Taxa de conclusão no período, considerando apenas dias programados até hoje. */
export function completionRate(h: Habit, logs: HabitLog[], from: DateKey, to: DateKey, today: DateKey): { scheduled: number; done: number; rate: number } {
  const map = logsByDate(logs, h.id);
  const end = to < today ? to : today;
  let scheduled = 0;
  let done = 0;
  if (h.frequency === 'weekly') {
    const days = rangeKeys(from < h.startDate ? h.startDate : from, end);
    done = days.filter((k) => isCompletedOn(h, map, k)).length;
    scheduled = Math.max(1, Math.round(((h.weeklyTarget ?? 1) * days.length) / 7));
    return { scheduled, done, rate: Math.min(1, done / scheduled) };
  }
  for (const k of rangeKeys(from, end)) {
    if (!isScheduledOn(h, k)) continue;
    scheduled++;
    if (isCompletedOn(h, map, k)) done++;
  }
  return { scheduled, done, rate: scheduled ? done / scheduled : 0 };
}

export interface HabitDaySummary {
  scheduled: number;
  done: number;
  progress: number;
}

export function habitsTodaySummary(habits: Habit[], logs: HabitLog[], today: DateKey): HabitDaySummary {
  const active = habits.filter((h) => !h.archivedAt && h.frequency === 'daily' && isScheduledOn(h, today));
  const done = active.filter((h) => isCompletedOn(h, logsByDate(logs, h.id), today)).length;
  return { scheduled: active.length, done, progress: active.length ? done / active.length : 0 };
}

/**
 * Registrar conclusão: um registro por hábito e dia (incrementa a contagem até a meta),
 * evitando duplicidade.
 */
export function applyCheck(logs: HabitLog[], h: Habit, date: DateKey, nowIso: string, newId: () => string): HabitLog {
  const existing = logs.find((l) => l.habitId === h.id && l.date === date);
  const target = Math.max(1, h.dailyTarget);
  if (existing) return { ...existing, count: Math.min(target, existing.count + 1), updatedAt: nowIso };
  return { id: newId(), habitId: h.id, date, count: 1, createdAt: nowIso, updatedAt: nowIso };
}

export type HeatCell = { key: DateKey; state: 'done' | 'partial' | 'missed' | 'off' | 'future' };

export function heatmap(h: Habit, logs: HabitLog[], from: DateKey, to: DateKey, today: DateKey): HeatCell[] {
  const map = logsByDate(logs, h.id);
  return rangeKeys(from, to).map((key) => {
    if (key > today) return { key, state: 'future' };
    if (!isScheduledOn(h, key)) return { key, state: (map.get(key) ?? 0) > 0 ? 'done' : 'off' };
    const c = map.get(key) ?? 0;
    if (c >= Math.max(1, h.dailyTarget)) return { key, state: 'done' };
    if (c > 0) return { key, state: 'partial' };
    return { key, state: key === today ? 'future' : 'missed' };
  });
}
