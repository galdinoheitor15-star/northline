import { addDaysKey, addMonthsKey, daysInMonth, endOfMonthKey, isValidKey, makeKey, minutesToTime, timeToMinutes, toDateKey, toTimeOfDay, weekdayOfKey, zonedParts } from '../time';
import type { DateKey, Recurrence, TimeOfDay } from '../types';
import { normalize, NUMBER_WORD_PATTERN, wordToNumber } from './normalize';

export type PartOfDay = 'manha' | 'tarde' | 'noite';

export interface DateTimeInfo {
  date?: DateKey;
  time?: TimeOfDay;
  endTime?: TimeOfDay;
  durationMinutes?: number;
  recurrence?: Recurrence;
  partOfDay?: PartOfDay;
  warnings: string[];
}

export interface ParseContext {
  now: Date;
  tz: string;
}

const WEEKDAY_NAMES: [RegExp, number][] = [
  [/^dom/, 0],
  [/^seg/, 1],
  [/^ter/, 2],
  [/^qua/, 3],
  [/^qui/, 4],
  [/^sex/, 5],
  [/^sab/, 6],
];
const WD = '(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:s)?(?:-feiras?| feiras?)?';
const MONTHS = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const NUM = `(\\d{1,2}|${NUMBER_WORD_PATTERN})`;

const weekdayIndex = (s: string) => WEEKDAY_NAMES.find(([re]) => re.test(s))?.[1] ?? -1;

/**
 * Extrai data, hora, duração e recorrência de uma frase em português.
 * Os trechos reconhecidos são marcados em `mask` para depois sobrar só o título.
 */
export class Extractor {
  readonly original: string;
  norm: string;
  private spans: [number, number][] = [];

  constructor(text: string) {
    this.original = text;
    this.norm = normalize(text);
  }

  /** Procura `re` no texto ainda não consumido; consome o trecho e devolve o match. */
  take(re: RegExp): RegExpExecArray | null {
    const m = new RegExp(re.source, re.flags.replace('g', '')).exec(this.norm);
    if (!m) return null;
    this.consume(m.index, m.index + m[0].length);
    return m;
  }

  test(re: RegExp): boolean {
    return re.test(this.norm);
  }

  consume(start: number, end: number) {
    this.spans.push([start, end]);
    this.norm = this.norm.slice(0, start) + ' '.repeat(end - start) + this.norm.slice(end);
  }

  /** Texto original sem os trechos consumidos. */
  remainder(): string {
    let out = '';
    for (let i = 0; i < this.original.length; i++) {
      out += this.spans.some(([s, e]) => i >= s && i < e) ? ' ' : this.original[i];
    }
    return out;
  }
}

function hourFromPeriod(h: number, period: string | undefined, warnings: string[], explicitFormat: boolean): number {
  if (period) {
    if (/tarde|noite/.test(period) && h < 12) return h + 12;
    if (/madrugada|manha/.test(period) && h === 12) return 0;
    return h;
  }
  // "às 3" sem "da tarde": compromissos de 1h a 6h quase sempre são à tarde
  if (!explicitFormat && h >= 1 && h <= 6) {
    warnings.push(`Interpretei "${h}" como ${h + 12}:00. Ajuste se for de madrugada.`);
    return h + 12;
  }
  return h;
}

export function extractDateTime(ex: Extractor, ctx: ParseContext): DateTimeInfo {
  const info: DateTimeInfo = { warnings: [] };
  const today = toDateKey(ctx.now, ctx.tz);
  const nowParts = zonedParts(ctx.now, ctx.tz);

  // ---------- recorrência ----------
  if (ex.take(/\b(?:todos os dias|todo dia|diariamente)\b/)) info.recurrence = { freq: 'daily', interval: 1 };
  else if (ex.take(/\b(?:(?:em |nos )?dias (?:de semana|uteis)|de segunda a sexta)\b/)) info.recurrence = { freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5] };
  else {
    const m = ex.take(new RegExp(`\\b(?:todas? as|todos? os|toda|todo)\\s+${WD}((?:\\s*(?:,|e)\\s*${WD})*)`));
    if (m) {
      const days = new Set<number>([weekdayIndex(m[1])]);
      const rest = m[2] ?? '';
      for (const d of rest.matchAll(new RegExp(WD, 'g'))) days.add(weekdayIndex(d[1]));
      info.recurrence = { freq: 'weekly', interval: 1, byWeekday: [...days].sort() };
    } else if (ex.take(/\b(?:toda semana|todas as semanas|semanalmente)\b/)) info.recurrence = { freq: 'weekly', interval: 1 };
    else if (ex.take(/\b(?:a cada (\d+|duas|tres) semanas)\b/)) info.recurrence = { freq: 'weekly', interval: 2 };
    else if (ex.take(/\b(?:todo mes|todos os meses|mensalmente)\b/)) info.recurrence = { freq: 'monthly', interval: 1 };
    else if (ex.take(/\b(?:todo ano|todos os anos|anualmente)\b/)) info.recurrence = { freq: 'yearly', interval: 1 };
  }

  // ---------- horário relativo: "daqui a 2 horas", "em 30 minutos" ----------
  const rel = ex.take(new RegExp(`\\b(?:daqui a|daqui|em|dentro de)\\s+(${NUMBER_WORD_PATTERN}|\\d+|meia)\\s*(minutos?|min|horas?|h|dias?|semanas?|mes|meses)\\b`));
  if (rel) {
    const qty = rel[1] === 'meia' ? 0.5 : wordToNumber(rel[1]) ?? 0;
    const unit = rel[2];
    if (/^min/.test(unit) || /^h/.test(unit)) {
      const minutes = /^min/.test(unit) ? qty : qty * 60;
      const at = new Date(ctx.now.getTime() + minutes * 60_000);
      info.date = toDateKey(at, ctx.tz);
      info.time = toTimeOfDay(at, ctx.tz);
    } else if (/^dia/.test(unit)) info.date = addDaysKey(today, qty);
    else if (/^semana/.test(unit)) info.date = addDaysKey(today, qty * 7);
    else info.date = addMonthsKey(today, qty) ?? undefined;
  }

  // ---------- datas ----------
  if (!info.date) {
    if (ex.take(/\b(?:para |pra )?depois de amanha\b/)) info.date = addDaysKey(today, 2);
    else if (ex.take(/\b(?:para |pra )?amanha\b/)) info.date = addDaysKey(today, 1);
    else if (ex.take(/\b(?:para |pra )?hoje\b/)) info.date = today;
    else if (ex.take(/\bontem\b/)) info.date = addDaysKey(today, -1);
  }
  if (!info.date && ex.take(/\b(?:no |ate o |para o |pro )?(?:fim|final) do mes\b/)) info.date = endOfMonthKey(today);
  if (!info.date && ex.take(/\b(?:no |neste |nesse |este |esse )?fim de semana\b/)) {
    const delta = (6 - weekdayOfKey(today) + 7) % 7;
    info.date = addDaysKey(today, delta);
  }
  if (!info.date && !info.recurrence) {
    const m = ex.take(new RegExp(`\\b(?:(?:na|no|nesta|neste|nessa|nesse|esta|este|essa|esse)\\s+)?(proxim[oa]\\s+)?${WD}(\\s+que vem)?\\b`));
    if (m) {
      const target = weekdayIndex(m[2]);
      let delta = (target - weekdayOfKey(today) + 7) % 7;
      if ((m[1] || m[3]) && delta === 0) delta = 7;
      info.date = addDaysKey(today, delta);
    }
  }
  if (!info.date) {
    const m = ex.take(/\b(?:(?:no |em |para o |pro |ate o )?dia\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (m) {
      const d = Number(m[1]);
      const mo = Number(m[2]);
      let y = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : nowParts.y;
      let key = makeKey(y, mo, d);
      if (!m[3] && key < today) key = makeKey(++y, mo, d);
      if (isValidKey(key)) info.date = key;
      else info.warnings.push('Data inválida.');
    }
  }
  if (!info.date) {
    const m = ex.take(new RegExp(`\\b(?:(?:no |em |para o |pro )?dia\\s+)?(\\d{1,2})\\s+de\\s+(${MONTHS.join('|')})(?:\\s+de\\s+(\\d{4}))?\\b`));
    if (m) {
      const d = Number(m[1]);
      const mo = MONTHS.indexOf(m[2]) + 1;
      let y = m[3] ? Number(m[3]) : nowParts.y;
      let key = makeKey(y, mo, d);
      if (!m[3] && key < today) key = makeKey(++y, mo, d);
      if (isValidKey(key)) info.date = key;
    }
  }
  if (!info.date) {
    const m = ex.take(/\b(?:no |para o |pro |ate o )?dia\s+(\d{1,2})\b/);
    if (m) {
      const d = Number(m[1]);
      let y = nowParts.y;
      let mo = nowParts.m;
      if (d < nowParts.d) {
        mo++;
        if (mo > 12) {
          mo = 1;
          y++;
        }
      }
      if (d >= 1 && d <= daysInMonth(y, mo)) info.date = makeKey(y, mo, d);
      else info.warnings.push(`O mês não tem dia ${d}.`);
    }
  }
  if (!info.date && ex.take(/\b(?:na )?semana que vem\b/)) {
    const delta = (1 - weekdayOfKey(today) + 7) % 7 || 7;
    info.date = addDaysKey(today, delta);
  }

  // ---------- horários ----------
  const PERIOD = '(?:\\s+(?:da|de|pela)\\s+(manha|tarde|noite|madrugada))?';
  const PREFIX = '(?:(?:para as|pras|pelas|pela|por volta das|por volta da|as|a)\\s+)?';
  const HOUR = `(\\d{1,2})(?:\\s*(?::|h)\\s*(\\d{2}))?\\s*(h|hs|horas?)?`;

  if (!info.time) {
    // intervalo: "das 14h às 16h", "de 9 a 10", "14h-16h"
    const r = ex.take(new RegExp(`\\b(?:das|de)\\s+${HOUR}${PERIOD}\\s+(?:as|a|ate)\\s+${HOUR}${PERIOD}`));
    const r2 = r ? null : ex.take(/\b(\d{1,2})(?:[:h](\d{2}))?\s*h?\s*-\s*(\d{1,2})(?:[:h](\d{2}))?\s*h\b/);
    if (r) {
      const explicit1 = !!(r[2] || r[3]);
      const explicit2 = !!(r[6] || r[7]);
      const h1 = hourFromPeriod(Number(r[1]), r[4] ?? r[8], info.warnings, explicit1 || !!r[8]);
      const h2 = hourFromPeriod(Number(r[5]), r[8], [], explicit2);
      info.time = minutesToTime(h1 * 60 + Number(r[2] ?? 0));
      info.endTime = minutesToTime((h2 < h1 ? h2 + 12 : h2) * 60 + Number(r[6] ?? 0));
    } else if (r2) {
      info.time = minutesToTime(Number(r2[1]) * 60 + Number(r2[2] ?? 0));
      info.endTime = minutesToTime(Number(r2[3]) * 60 + Number(r2[4] ?? 0));
    }
  }
  if (!info.time) {
    const noon = ex.take(new RegExp(`\\b${PREFIX}meio[- ]dia(\\s+e\\s+meia)?\\b`));
    if (noon) info.time = noon[1] ? '12:30' : '12:00';
    else if (ex.take(new RegExp(`\\b${PREFIX}meia[- ]noite\\b`))) info.time = '00:00';
  }
  if (!info.time) {
    // "15h", "15h30", "15:30", "às 15", "às 3 da tarde", "às três e meia"
    const m =
      ex.take(new RegExp(`\\b${PREFIX}(\\d{1,2})\\s*(?::|h)\\s*(\\d{2})\\b${PERIOD}`)) ??
      ex.take(new RegExp(`\\b${PREFIX}(\\d{1,2})\\s*(h|hs|horas?)\\b(?:\\s+e\\s+(meia|\\d{1,2}))?${PERIOD}`)) ??
      ex.take(new RegExp(`\\b(?:para as|pras|pelas|por volta das|as)\\s+${NUM}(?:\\s+e\\s+(meia|\\d{1,2}|quinze))?${PERIOD}\\b`));
    if (m) {
      const groups = m.slice(1).filter((g) => g !== undefined);
      const hourRaw = m[1];
      const h = wordToNumber(hourRaw) ?? Number(hourRaw);
      let minutes = 0;
      let period: string | undefined;
      let explicit = false;
      for (const g of groups.slice(1)) {
        if (/^(manha|tarde|noite|madrugada)$/.test(g)) period = g;
        else if (g === 'meia') minutes = 30;
        else if (g === 'quinze') minutes = 15;
        else if (/^(h|hs|horas?)$/.test(g)) explicit = true;
        else if (/^\d{1,2}$/.test(g)) {
          minutes = Number(g);
          explicit = true;
        }
      }
      if (/(:|h)\s*\d{2}/.test(m[0])) explicit = true;
      if (h <= 23 && minutes < 60) {
        const hour = hourFromPeriod(h, period, info.warnings, explicit || h >= 13 || h === 0);
        info.time = minutesToTime(hour * 60 + minutes);
      }
    }
  }
  if (!info.time) {
    const p = ex.take(/\b(?:de|pela|a|na|durante a)\s+(manha|tarde|noite|madrugada)\b/);
    if (p) info.partOfDay = p[1] === 'madrugada' ? 'manha' : (p[1] as PartOfDay);
  }

  // ---------- duração ----------
  const dur =
    ex.take(new RegExp(`(?:,\\s*)?\\b(?:com duracao de|com duracao|duracao de|durante|por|de)\\s+(${NUMBER_WORD_PATTERN}|\\d+|meia)\\s*(horas?|h|minutos?|min)(?:\\s+e\\s+(meia|\\d+\\s*(?:minutos?|min)))?\\b`)) ??
    ex.take(/(?:,\s*)?\b(?:com duracao de|durante|por)\s+(\d{1,2})h(\d{2})\b/);
  if (dur) {
    if (/^\d{1,2}$/.test(dur[2] ?? '') && /h\d{2}/.test(dur[0])) {
      info.durationMinutes = Number(dur[1]) * 60 + Number(dur[2]);
    } else {
      const qty = dur[1] === 'meia' ? 0.5 : wordToNumber(dur[1]) ?? 0;
      let minutes = /^h/.test(dur[2]) ? qty * 60 : qty;
      if (dur[3] === 'meia') minutes += 30;
      else if (dur[3]) minutes += Number(dur[3].replace(/\D/g, ''));
      if (minutes > 0) info.durationMinutes = Math.round(minutes);
    }
  }
  if (info.time && info.endTime && !info.durationMinutes) {
    let diff = timeToMinutes(info.endTime) - timeToMinutes(info.time);
    if (diff <= 0) diff += 1440;
    info.durationMinutes = diff;
  }

  // sem data explícita mas com hora: hoje se ainda não passou, senão amanhã
  if (!info.date && info.time && !info.recurrence) {
    const nowTime = toTimeOfDay(ctx.now, ctx.tz);
    info.date = info.time > nowTime ? today : addDaysKey(today, 1);
    if (info.date !== today) info.warnings.push('Como esse horário já passou hoje, considerei amanhã.');
  }
  if (info.recurrence && !info.date) {
    const days = info.recurrence.byWeekday;
    if (days?.length) {
      let delta = 0;
      while (!days.includes(weekdayOfKey(addDaysKey(today, delta)))) delta++;
      info.date = addDaysKey(today, delta);
    } else info.date = today;
  }
  return info;
}

const LEADING_NOISE = /^(?:\s|,|\.|;|:|!|-)*(?:(?:por favor|pfv|ei|oi|ok|northline)\s*,?\s*)*/i;
const COMMANDS = [
  'me lembra de', 'me lembre de', 'lembrar de', 'lembra de', 'lembrete de', 'lembrete para',
  'marca', 'marcar', 'marque', 'agenda', 'agendar', 'agende', 'adiciona', 'adicionar', 'adicione', 'cria', 'criar', 'crie',
  'anota', 'anotar', 'anote', 'coloca', 'colocar', 'coloque', 'bota', 'botar', 'põe', 'poe', 'inclui', 'incluir',
  'tenho que', 'tenho', 'preciso', 'vou ter', 'vou', 'nova tarefa', 'tarefa', 'novo compromisso', 'compromisso de', 'evento de',
];
const ARTICLES = /^(?:uma|um|o|a|os|as|minha|meu|minhas|meus|de|da|do|para|pra|que)\s+/i;
const TRAILING = /(?:\s+(?:e|na|no|para|pra|de|da|do|com|às|as|a|em|que|,))+\s*$/i;

/** Monta um título limpo a partir do que sobrou da frase. */
export function cleanTitle(rest: string): string {
  let t = rest.replace(/\s+/g, ' ').replace(LEADING_NOISE, '').trim();
  let changed = true;
  while (changed) {
    changed = false;
    const n = normalize(t);
    for (const c of COMMANDS) {
      const nc = normalize(c);
      if (n.startsWith(nc + ' ') || n === nc) {
        t = t.slice(c.length).trim();
        changed = true;
        break;
      }
    }
    if (ARTICLES.test(t)) {
      t = t.replace(ARTICLES, '');
      changed = true;
    }
  }
  t = t.replace(/\s+([,.;!?])/g, '$1').replace(/[,.;:!?]+\s*$/g, '').replace(/^[,.;:\s]+/, '');
  t = t.replace(/\s*,\s*,/g, ',').trim();
  for (let i = 0; i < 3; i++) t = t.replace(TRAILING, '').replace(/[,.;:]+$/, '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}
