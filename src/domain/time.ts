import { TZDate } from '@date-fns/tz';
import type { DateKey, TimeOfDay } from './types';

export const DEFAULT_TZ = 'America/Recife';

const pad = (n: number) => String(n).padStart(2, '0');

export interface ZonedParts {
  y: number;
  m: number; // 1-12
  d: number;
  hh: number;
  mm: number;
  weekday: number; // 0 = domingo
}

export function zonedParts(date: Date, tz: string): ZonedParts {
  const z = new TZDate(date.getTime(), tz);
  return { y: z.getFullYear(), m: z.getMonth() + 1, d: z.getDate(), hh: z.getHours(), mm: z.getMinutes(), weekday: z.getDay() };
}

export function makeKey(y: number, m: number, d: number): DateKey {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parseKey(key: DateKey): { y: number; m: number; d: number } {
  const [y, m, d] = key.split('-').map(Number);
  return { y, m, d };
}

export function isValidKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const { y, m, d } = parseKey(key);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export function isValidTime(t: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(t);
  return !!m && Number(m[1]) < 24 && Number(m[2]) < 60;
}

export function toDateKey(date: Date, tz: string): DateKey {
  const p = zonedParts(date, tz);
  return makeKey(p.y, p.m, p.d);
}

export function toTimeOfDay(date: Date, tz: string): TimeOfDay {
  const p = zonedParts(date, tz);
  return `${pad(p.hh)}:${pad(p.mm)}`;
}

/** Converte uma data/hora local (no fuso informado) para o instante UTC correspondente. */
export function zonedToUtc(key: DateKey, time: TimeOfDay, tz: string): Date {
  const { y, m, d } = parseKey(key);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(new TZDate(y, m - 1, d, hh, mm, 0, 0, tz).getTime());
}

export function startOfDayUtc(key: DateKey, tz: string): Date {
  return zonedToUtc(key, '00:00', tz);
}

export function endOfDayUtc(key: DateKey, tz: string): Date {
  return new Date(startOfDayUtc(addDaysKey(key, 1), tz).getTime() - 1);
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// Aritmética de calendário feita em UTC puro para não sofrer com horário de verão.
function keyToUtcMs(key: DateKey): number {
  const { y, m, d } = parseKey(key);
  return Date.UTC(y, m - 1, d);
}

function utcMsToKey(ms: number): DateKey {
  const dt = new Date(ms);
  return makeKey(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addDaysKey(key: DateKey, n: number): DateKey {
  return utcMsToKey(keyToUtcMs(key) + n * 86_400_000);
}

export function diffDaysKeys(a: DateKey, b: DateKey): number {
  return Math.round((keyToUtcMs(a) - keyToUtcMs(b)) / 86_400_000);
}

export function weekdayOfKey(key: DateKey): number {
  return new Date(keyToUtcMs(key)).getUTCDay();
}

/** Soma meses. Com clamp=false devolve null quando o dia não existe no mês (ex.: 31/02). */
export function addMonthsKey(key: DateKey, n: number, clamp = true): DateKey | null {
  const { y, m, d } = parseKey(key);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const dim = daysInMonth(ny, nm);
  if (d > dim && !clamp) return null;
  return makeKey(ny, nm, Math.min(d, dim));
}

export function startOfWeekKey(key: DateKey, weekStartsOn: 0 | 1 = 1): DateKey {
  const wd = weekdayOfKey(key);
  const delta = (wd - weekStartsOn + 7) % 7;
  return addDaysKey(key, -delta);
}

export function startOfMonthKey(key: DateKey): DateKey {
  const { y, m } = parseKey(key);
  return makeKey(y, m, 1);
}

export function endOfMonthKey(key: DateKey): DateKey {
  const { y, m } = parseKey(key);
  return makeKey(y, m, daysInMonth(y, m));
}

export function rangeKeys(from: DateKey, to: DateKey): DateKey[] {
  const out: DateKey[] = [];
  for (let k = from; k <= to; k = addDaysKey(k, 1)) out.push(k);
  return out;
}

export const WEEKDAYS_LONG = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const WEEKDAYS_LETTER = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
export const MONTHS_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** "quinta-feira, 30 de outubro de 2026" */
export function formatLongDate(key: DateKey): string {
  const { y, m, d } = parseKey(key);
  return `${WEEKDAYS_LONG[weekdayOfKey(key)]}, ${d} de ${MONTHS_LONG[m - 1]} de ${y}`;
}

/** "30 de outubro" */
export function formatDayMonth(key: DateKey): string {
  const { m, d } = parseKey(key);
  return `${d} de ${MONTHS_LONG[m - 1]}`;
}

/** "30/10" */
export function formatShortDate(key: DateKey): string {
  const { m, d } = parseKey(key);
  return `${pad(d)}/${pad(m)}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h${pad(m)}` : `${h}h`;
}

export function greeting(date: Date, tz: string): string {
  const { hh } = zonedParts(date, tz);
  if (hh >= 5 && hh < 12) return 'Bom dia';
  if (hh >= 12 && hh < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function timeToMinutes(t: TimeOfDay): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(min: number): TimeOfDay {
  const v = ((min % 1440) + 1440) % 1440;
  return `${pad(Math.floor(v / 60))}:${pad(v % 60)}`;
}

export function relativeDayLabel(key: DateKey, today: DateKey): string {
  const diff = diffDaysKeys(key, today);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  if (diff === -1) return 'Ontem';
  return `${WEEKDAYS_SHORT[weekdayOfKey(key)]}, ${formatShortDate(key)}`;
}
