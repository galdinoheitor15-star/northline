import { addDaysKey, addMonthsKey, diffDaysKeys, parseKey, startOfWeekKey, toDateKey, toTimeOfDay, weekdayOfKey, zonedToUtc } from './time';
import type { CalendarEvent, DateKey, EventOccurrence, Recurrence } from './types';

const MAX_ITERATIONS = 5000;

/** Verifica se uma data pertence à regra, partindo da data inicial da série. */
export function matchesRule(key: DateKey, startKey: DateKey, rule: Recurrence): boolean {
  if (key < startKey) return false;
  if (rule.until && key > rule.until) return false;
  const interval = Math.max(1, rule.interval || 1);
  switch (rule.freq) {
    case 'daily':
      return diffDaysKeys(key, startKey) % interval === 0;
    case 'weekly': {
      const days = rule.byWeekday?.length ? rule.byWeekday : [weekdayOfKey(startKey)];
      if (!days.includes(weekdayOfKey(key))) return false;
      const weeks = diffDaysKeys(startOfWeekKey(key, 0), startOfWeekKey(startKey, 0)) / 7;
      return weeks % interval === 0;
    }
    case 'monthly': {
      const a = parseKey(key);
      const s = parseKey(startKey);
      if (a.d !== s.d) return false;
      const months = (a.y - s.y) * 12 + (a.m - s.m);
      return months % interval === 0;
    }
    case 'yearly': {
      const a = parseKey(key);
      const s = parseKey(startKey);
      return a.m === s.m && a.d === s.d && (a.y - s.y) % interval === 0;
    }
  }
}

/**
 * Gera as datas da série entre `from` e `to` (inclusive), respeitando `count` desde o início.
 */
export function expandDates(startKey: DateKey, rule: Recurrence, from: DateKey, to: DateKey): DateKey[] {
  const out: DateKey[] = [];
  let produced = 0;
  let iterations = 0;
  const next = stepper(startKey, rule);
  for (let key: DateKey | null = startKey; key && iterations < MAX_ITERATIONS; key = next(key), iterations++) {
    if (key > to) break;
    if (rule.until && key > rule.until) break;
    if (!matchesRule(key, startKey, rule)) continue;
    produced++;
    if (rule.count && produced > rule.count) break;
    if (key >= from) out.push(key);
  }
  return out;
}

function stepper(startKey: DateKey, rule: Recurrence): (k: DateKey) => DateKey | null {
  const interval = Math.max(1, rule.interval || 1);
  switch (rule.freq) {
    case 'daily':
      return (k) => addDaysKey(k, interval);
    case 'weekly':
      return (k) => addDaysKey(k, 1);
    case 'monthly': {
      let n = 0;
      return () => {
        // pula meses sem o dia (ex.: dia 31) sem perder a âncora
        for (let tries = 0; tries < 48; tries++) {
          n += interval;
          const k = addMonthsKey(startKey, n, false);
          if (k) return k;
        }
        return null;
      };
    }
    case 'yearly': {
      let n = 0;
      return () => {
        for (let tries = 0; tries < 8; tries++) {
          n += 12 * interval;
          const k = addMonthsKey(startKey, n, false);
          if (k) return k;
        }
        return null;
      };
    }
  }
}

/** Próxima data da regra estritamente depois de `after`. */
export function nextDate(startKey: DateKey, rule: Recurrence, after: DateKey): DateKey | null {
  const horizon = addDaysKey(after, 366 * 5);
  const dates = expandDates(startKey, rule, addDaysKey(after, 1), horizon);
  return dates[0] ?? null;
}

/**
 * Expande eventos (incluindo séries recorrentes e ocorrências editadas) no intervalo [from, to].
 * Ocorrências editadas isoladamente substituem a ocorrência original da série.
 */
export function expandEvents(events: CalendarEvent[], from: Date, to: Date): EventOccurrence[] {
  const out: EventOccurrence[] = [];
  const active = events.filter((e) => e.status !== 'cancelled');
  for (const ev of active) {
    const start = new Date(ev.startAt);
    const end = new Date(ev.endAt);
    const duration = end.getTime() - start.getTime();
    if (!ev.recurrence) {
      if (end >= from && start <= to) out.push({ key: ev.id, event: ev, start, end, isRecurring: !!ev.recurringEventId });
      continue;
    }
    const tz = ev.timezone;
    const startKey = toDateKey(start, tz);
    const localTime = toTimeOfDay(start, tz);
    const fromKey = addDaysKey(toDateKey(from, tz), -Math.ceil(duration / 86_400_000) - 1);
    const toKey = toDateKey(to, tz);
    const exceptions = new Set(ev.recurrenceExceptions.map((s) => new Date(s).getTime()));
    for (const key of expandDates(startKey, ev.recurrence, fromKey, toKey)) {
      const occStart = zonedToUtc(key, localTime, tz);
      if (exceptions.has(occStart.getTime())) continue;
      const occEnd = new Date(occStart.getTime() + duration);
      if (occEnd < from || occStart > to) continue;
      out.push({ key: `${ev.id}:${occStart.toISOString()}`, event: ev, start: occStart, end: occEnd, isRecurring: true });
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function describeRecurrence(rule: Recurrence | null): string {
  if (!rule) return 'Não se repete';
  const names = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const every = rule.interval > 1 ? `A cada ${rule.interval} ` : '';
  let base: string;
  switch (rule.freq) {
    case 'daily':
      base = rule.interval > 1 ? `${every}dias` : 'Todos os dias';
      break;
    case 'weekly': {
      const days = rule.byWeekday?.length ? rule.byWeekday.map((d) => names[d]).join(', ') : '';
      base = rule.interval > 1 ? `${every}semanas${days ? ` (${days})` : ''}` : days ? `Toda ${days}` : 'Toda semana';
      break;
    }
    case 'monthly':
      base = rule.interval > 1 ? `${every}meses` : 'Todo mês';
      break;
    case 'yearly':
      base = 'Todo ano';
      break;
  }
  if (rule.until) base += ` até ${rule.until.split('-').reverse().join('/')}`;
  if (rule.count) base += ` (${rule.count} vezes)`;
  return base;
}
