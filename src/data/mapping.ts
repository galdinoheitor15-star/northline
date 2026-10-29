import type { TableSpec } from './collections';

// Conversão entre entidades do app (camelCase) e linhas do Postgres (snake_case).

const toSnake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toCamel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

// Campos que existem só no banco e não devem ser enviados pelo cliente.
const SERVER_ONLY = new Set(['user_id', 'created_at', 'updated_at', 'external_updated_at']);

export function toRow(entity: Record<string, unknown>, spec: TableSpec): { row: Record<string, unknown>; children: Record<string, unknown>[] | null } {
  const row: Record<string, unknown> = {};
  let children: Record<string, unknown>[] | null = null;
  for (const [k, v] of Object.entries(entity)) {
    if (spec.child && k === spec.child.key) {
      children = (v as Record<string, unknown>[]).map((c) => {
        const r: Record<string, unknown> = {};
        for (const [ck, cv] of Object.entries(c)) r[toSnake(ck)] = cv === undefined ? null : cv;
        r[spec.child!.fk] = entity.id;
        return r;
      });
      continue;
    }
    const col = toSnake(k);
    if (SERVER_ONLY.has(col)) continue;
    row[col] = v === undefined ? null : v;
  }
  return { row, children };
}

function normalizeValue(col: string, v: unknown, spec: TableSpec): unknown {
  if (v === null || v === undefined) return v ?? null;
  if (spec.timeColumns?.includes(col) && typeof v === 'string') return v.slice(0, 5);
  if (spec.numericColumns?.includes(col) && typeof v === 'string') return Number(v);
  if (/_at$/.test(col) && typeof v === 'string') return new Date(v).toISOString();
  if (col === 'recurrence_exceptions' && Array.isArray(v)) return v.map((s) => new Date(s as string).toISOString());
  return v;
}

export function fromRow<T>(row: Record<string, unknown>, spec: TableSpec): T {
  const out: Record<string, unknown> = {};
  for (const [col, v] of Object.entries(row)) {
    if (col === 'user_id') continue;
    if (spec.child && col === spec.child.table) {
      out[spec.child.key] = ((v as Record<string, unknown>[]) ?? [])
        .map((c) => {
          const o: Record<string, unknown> = {};
          for (const [cc, cv] of Object.entries(c)) {
            if (cc === 'user_id' || cc === spec.child!.fk || cc === 'created_at' || cc === 'updated_at') continue;
            o[toCamel(cc)] = normalizeValue(cc, cv, spec);
          }
          return o;
        })
        .sort((a, b) => ((a.position as number) ?? 0) - ((b.position as number) ?? 0));
      continue;
    }
    out[toCamel(col)] = normalizeValue(col, v, spec);
  }
  if (spec.child && !(spec.child.key in out)) out[spec.child.key] = [];
  return out as T;
}
