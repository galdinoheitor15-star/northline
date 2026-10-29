import { expandEvents } from './recurrence';
import { isValidKey, isValidTime, zonedToUtc } from './time';
import type { CalendarEvent, DateKey, EventCategory, EventOccurrence, Recurrence, TimeOfDay } from './types';

export const EVENT_CATEGORIES: { id: EventCategory; label: string }[] = [
  { id: 'work', label: 'Trabalho' },
  { id: 'study', label: 'Estudos' },
  { id: 'personal', label: 'Pessoal' },
  { id: 'meeting', label: 'Reuniões' },
  { id: 'health', label: 'Saúde e treino' },
  { id: 'other', label: 'Outros' },
];

export const categoryLabel = (c: EventCategory) => EVENT_CATEGORIES.find((x) => x.id === c)?.label ?? 'Outros';

export const REMINDER_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Sem lembrete' },
  { value: 0, label: 'No horário' },
  { value: 5, label: '5 min antes' },
  { value: 10, label: '10 min antes' },
  { value: 30, label: '30 min antes' },
  { value: 60, label: '1 hora antes' },
  { value: 1440, label: '1 dia antes' },
];

export function reminderLabel(min: number | null): string {
  const opt = REMINDER_OPTIONS.find((o) => o.value === min);
  if (opt) return opt.label;
  if (min == null) return 'Sem lembrete';
  return min % 60 === 0 ? `${min / 60} h antes` : `${min} min antes`;
}

export interface EventDraft {
  title: string;
  description?: string | null;
  date: DateKey;
  startTime: TimeOfDay;
  endTime?: TimeOfDay | null;
  durationMinutes?: number | null;
  allDay?: boolean;
  timezone: string;
  location?: string | null;
  meetingUrl?: string | null;
  category: EventCategory;
  reminderMinutes: number | null;
  recurrence: Recurrence | null;
}

export interface ValidationResult {
  ok: boolean;
  errors: Record<string, string>;
}

export function validateEventDraft(d: EventDraft): ValidationResult {
  const errors: Record<string, string> = {};
  if (!d.title.trim()) errors.title = 'Informe um título.';
  if (d.title.length > 200) errors.title = 'Título muito longo (máx. 200 caracteres).';
  if (!isValidKey(d.date)) errors.date = 'Data inválida.';
  if (!d.allDay) {
    if (!isValidTime(d.startTime)) errors.startTime = 'Horário de início inválido.';
    if (d.endTime && !isValidTime(d.endTime)) errors.endTime = 'Horário de término inválido.';
    if (d.durationMinutes != null && (d.durationMinutes <= 0 || d.durationMinutes > 24 * 60 * 14)) errors.duration = 'Duração inválida.';
  }
  if (!errors.date && !errors.startTime && !errors.endTime) {
    const { start, end } = draftRange(d);
    if (end <= start) errors.endTime = 'O término deve ser depois do início.';
  }
  if (d.reminderMinutes != null && (d.reminderMinutes < 0 || d.reminderMinutes > 60 * 24 * 7)) errors.reminder = 'Lembrete inválido.';
  if (d.recurrence) {
    if (d.recurrence.interval < 1 || d.recurrence.interval > 365) errors.recurrence = 'Intervalo de repetição inválido.';
    if (d.recurrence.until && d.recurrence.until < d.date) errors.recurrence = 'A repetição termina antes do início.';
  }
  if (d.meetingUrl && !/^https?:\/\//i.test(d.meetingUrl)) errors.meetingUrl = 'O link deve começar com http:// ou https://';
  return { ok: Object.keys(errors).length === 0, errors };
}

/** Calcula início/fim em UTC a partir do rascunho (data/hora locais no fuso do evento). */
export function draftRange(d: EventDraft): { start: Date; end: Date } {
  if (d.allDay) {
    const start = zonedToUtc(d.date, '00:00', d.timezone);
    return { start, end: new Date(start.getTime() + 86_400_000) };
  }
  const start = zonedToUtc(d.date, d.startTime, d.timezone);
  let end: Date;
  if (d.endTime) {
    end = zonedToUtc(d.date, d.endTime, d.timezone);
    // término "antes" do início significa que atravessa a meia-noite
    if (end <= start) end = new Date(end.getTime() + 86_400_000);
  } else {
    end = new Date(start.getTime() + (d.durationMinutes ?? 60) * 60_000);
  }
  return { start, end };
}

/** Encontra ocorrências que se sobrepõem ao intervalo informado. */
export function findConflicts(events: CalendarEvent[], start: Date, end: Date, ignoreId?: string): EventOccurrence[] {
  return expandEvents(events, new Date(start.getTime() - 86_400_000), new Date(end.getTime() + 86_400_000)).filter(
    (o) => !o.event.allDay && o.event.id !== ignoreId && o.start < end && o.end > start,
  );
}

/** Horários livres de um dia (entre dayStart e dayEnd) com pelo menos `minMinutes`. */
export function freeSlots(occurrences: EventOccurrence[], dayStart: Date, dayEnd: Date, minMinutes = 30): { start: Date; end: Date }[] {
  const busy = occurrences
    .filter((o) => !o.event.allDay && o.end > dayStart && o.start < dayEnd)
    .map((o) => ({ start: Math.max(o.start.getTime(), dayStart.getTime()), end: Math.min(o.end.getTime(), dayEnd.getTime()) }))
    .sort((a, b) => a.start - b.start);
  const slots: { start: Date; end: Date }[] = [];
  let cursor = dayStart.getTime();
  for (const b of busy) {
    if (b.start - cursor >= minMinutes * 60_000) slots.push({ start: new Date(cursor), end: new Date(b.start) });
    cursor = Math.max(cursor, b.end);
  }
  if (dayEnd.getTime() - cursor >= minMinutes * 60_000) slots.push({ start: new Date(cursor), end: dayEnd });
  return slots;
}

export function occurrenceDurationMinutes(o: { start: Date; end: Date }): number {
  return Math.round((o.end.getTime() - o.start.getTime()) / 60_000);
}

export type OccurrenceStatus = 'done' | 'now' | 'upcoming';
export function occurrenceStatus(o: { start: Date; end: Date }, now: Date): OccurrenceStatus {
  if (o.end <= now) return 'done';
  if (o.start <= now) return 'now';
  return 'upcoming';
}

/**
 * Edição de uma única ocorrência de uma série: adiciona exceção à série e devolve
 * os dados do evento avulso que substitui a ocorrência.
 */
export function detachOccurrence(series: CalendarEvent, occurrenceStart: Date): { series: CalendarEvent; exceptionIso: string } {
  const iso = occurrenceStart.toISOString();
  const exceptions = series.recurrenceExceptions.includes(iso) ? series.recurrenceExceptions : [...series.recurrenceExceptions, iso];
  return { series: { ...series, recurrenceExceptions: exceptions }, exceptionIso: iso };
}
