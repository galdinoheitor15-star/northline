// Regras puras da sincronização com o Google Agenda (sem dependências de Deno: testadas com vitest).

export interface LocalEventState {
  id: string;
  externalId: string | null;
  externalEtag: string | null;
  syncStatus: 'local' | 'pending' | 'synced' | 'conflict' | 'error';
  status: 'confirmed' | 'cancelled';
  recurrence: unknown | null;
}

export interface RemoteEvent {
  id: string;
  etag?: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  summary?: string;
  description?: string;
  location?: string;
  hangoutLink?: string;
  updated?: string;
  recurringEventId?: string;
  recurrence?: string[];
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
}

export type PullDecision = 'import' | 'update_local' | 'delete_local' | 'conflict' | 'noop' | 'skip';

/**
 * Decide o que fazer com um evento recebido do Google.
 * - "pending" no local significa alteração ainda não enviada: se o remoto também mudou, é conflito
 *   (nada é sobrescrito em silêncio; o usuário escolhe a versão).
 * - Instâncias de séries criadas pelo Northline são ignoradas (a série já existe localmente).
 */
export function decidePull(remote: RemoteEvent, local: LocalEventState | undefined, ownedSeriesExternalIds: Set<string>): PullDecision {
  if (remote.recurringEventId && ownedSeriesExternalIds.has(remote.recurringEventId)) return 'skip';
  if (!local) return remote.status === 'cancelled' ? 'noop' : 'import';
  const remoteChanged = remote.etag !== local.externalEtag;
  const localChanged = local.syncStatus === 'pending' || local.syncStatus === 'conflict';
  if (remote.status === 'cancelled') return localChanged && local.status !== 'cancelled' ? 'conflict' : 'delete_local';
  if (!remoteChanged) return 'noop';
  return localChanged ? 'conflict' : 'update_local';
}

export type PushAction = 'insert' | 'patch' | 'delete_remote' | 'delete_local_only' | 'none';

export function decidePush(local: LocalEventState): PushAction {
  if (local.syncStatus !== 'pending') return 'none';
  if (local.status === 'cancelled') return local.externalId ? 'delete_remote' : 'delete_local_only';
  return local.externalId ? 'patch' : 'insert';
}

/** Converte data/hora do Google em instantes UTC; eventos de dia inteiro usam meia-noite UTC. */
export function remoteRange(r: RemoteEvent): { startAt: string; endAt: string; allDay: boolean } | null {
  if (r.start?.dateTime && r.end?.dateTime) return { startAt: new Date(r.start.dateTime).toISOString(), endAt: new Date(r.end.dateTime).toISOString(), allDay: false };
  if (r.start?.date && r.end?.date) return { startAt: `${r.start.date}T00:00:00.000Z`, endAt: `${r.end.date}T00:00:00.000Z`, allDay: true };
  return null;
}

export interface SimpleRecurrence {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  byWeekday?: number[];
  until?: string | null;
  count?: number | null;
}

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** Regra de recorrência do Northline -> RRULE (RFC 5545) para o Google. */
export function toRRule(r: SimpleRecurrence): string {
  const parts = [`FREQ=${r.freq.toUpperCase()}`];
  if (r.interval > 1) parts.push(`INTERVAL=${r.interval}`);
  if (r.freq === 'weekly' && r.byWeekday?.length) parts.push(`BYDAY=${r.byWeekday.map((d) => DAY_CODES[d]).join(',')}`);
  if (r.until) parts.push(`UNTIL=${r.until.replace(/-/g, '')}T235959Z`);
  if (r.count) parts.push(`COUNT=${r.count}`);
  return `RRULE:${parts.join(';')}`;
}

export function fromRRule(lines: string[] | undefined): SimpleRecurrence | null {
  const rule = lines?.find((l) => l.startsWith('RRULE:'));
  if (!rule) return null;
  const kv = Object.fromEntries(rule.slice(6).split(';').map((p) => p.split('=')));
  const freq = String(kv.FREQ ?? '').toLowerCase();
  if (!['daily', 'weekly', 'monthly', 'yearly'].includes(freq)) return null;
  const until = kv.UNTIL ? `${kv.UNTIL.slice(0, 4)}-${kv.UNTIL.slice(4, 6)}-${kv.UNTIL.slice(6, 8)}` : null;
  const byWeekday = kv.BYDAY ? String(kv.BYDAY).split(',').map((c) => DAY_CODES.indexOf(c.replace(/^[-+\d]+/, ''))).filter((d) => d >= 0) : undefined;
  return { freq: freq as SimpleRecurrence['freq'], interval: Number(kv.INTERVAL ?? 1), byWeekday, until, count: kv.COUNT ? Number(kv.COUNT) : null };
}
