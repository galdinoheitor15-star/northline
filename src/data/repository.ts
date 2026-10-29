import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Profile } from '@/domain/types';
import { DEFAULT_TZ } from '@/domain/time';
import { getSupabase } from '@/lib/supabase';
import { COLLECTIONS, TABLES, type CollectionName, type Collections } from './collections';
import { fromRow, toRow } from './mapping';

export type Snapshot = { [K in CollectionName]: Collections[K][] };

/** Contrato da camada de dados. A interface não sabe se os dados estão no aparelho ou no Supabase. */
export interface Repository {
  readonly kind: 'local' | 'supabase';
  loadAll(): Promise<Snapshot>;
  upsert<K extends CollectionName>(c: K, items: Collections[K][]): Promise<void>;
  remove(c: CollectionName, ids: string[]): Promise<void>;
  loadProfile(): Promise<Profile>;
  saveProfile(p: Profile): Promise<void>;
}

export const emptySnapshot = (): Snapshot => Object.fromEntries(COLLECTIONS.map((c) => [c, []])) as unknown as Snapshot;

export function defaultProfile(id: string, displayName = ''): Profile {
  return {
    id,
    displayName,
    timezone: DEFAULT_TZ,
    currency: 'BRL',
    locale: 'pt-BR',
    defaultReminderMinutes: 10,
    weekStartsOn: 1,
    notifications: { events: true, tasks: true, habits: true, workouts: true },
    onboardedAt: null,
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Armazenamento local (modo sem conta e modo demonstração), por namespace.
// ---------------------------------------------------------------------------
export class LocalRepository implements Repository {
  readonly kind = 'local' as const;
  private cache: Snapshot | null = null;
  constructor(private namespace: string) {}

  private key(c: string) {
    return `nl:${this.namespace}:${c}`;
  }

  async loadAll(): Promise<Snapshot> {
    const entries = await AsyncStorage.multiGet(COLLECTIONS.map((c) => this.key(c)));
    const snap = emptySnapshot();
    entries.forEach(([, value], i) => {
      if (!value) return;
      try {
        (snap as Record<string, unknown[]>)[COLLECTIONS[i]] = JSON.parse(value);
      } catch {
        // dado corrompido: ignora a coleção em vez de travar o app
      }
    });
    this.cache = snap;
    return snap;
  }

  private async persist(c: CollectionName) {
    await AsyncStorage.setItem(this.key(c), JSON.stringify(this.cache![c]));
  }

  async upsert<K extends CollectionName>(c: K, items: Collections[K][]): Promise<void> {
    if (!this.cache) await this.loadAll();
    const list = this.cache![c] as Collections[K][];
    for (const item of items) {
      const i = list.findIndex((x) => x.id === item.id);
      if (i >= 0) list[i] = item;
      else list.push(item);
    }
    await this.persist(c);
  }

  async remove(c: CollectionName, ids: string[]): Promise<void> {
    if (!this.cache) await this.loadAll();
    (this.cache as Record<string, { id: string }[]>)[c] = (this.cache![c] as { id: string }[]).filter((x) => !ids.includes(x.id));
    await this.persist(c);
  }

  async loadProfile(): Promise<Profile> {
    const raw = await AsyncStorage.getItem(this.key('profile'));
    return raw ? { ...defaultProfile(this.namespace), ...JSON.parse(raw) } : defaultProfile(this.namespace);
  }

  async saveProfile(p: Profile): Promise<void> {
    await AsyncStorage.setItem(this.key('profile'), JSON.stringify(p));
  }

  async clear(): Promise<void> {
    await AsyncStorage.multiRemove([...COLLECTIONS.map((c) => this.key(c)), this.key('profile')]);
    this.cache = null;
  }

  async hasData(): Promise<boolean> {
    const snap = await this.loadAll();
    return COLLECTIONS.some((c) => snap[c].length > 0);
  }
}

// ---------------------------------------------------------------------------
// Supabase: cada chamada usa o JWT do usuário; o RLS garante o isolamento.
// ---------------------------------------------------------------------------
export class SupabaseRepository implements Repository {
  readonly kind = 'supabase' as const;
  constructor(private userId: string) {}

  async loadAll(): Promise<Snapshot> {
    const sb = getSupabase();
    const snap = emptySnapshot();
    await Promise.all(
      COLLECTIONS.map(async (c) => {
        const spec = TABLES[c];
        const select = spec.child ? `*, ${spec.child.table}(*)` : '*';
        const { data, error } = await sb.from(spec.table).select(select).limit(10000);
        if (error) throw new Error(`Falha ao carregar ${c}: ${error.message}`);
        (snap as Record<string, unknown[]>)[c] = (data ?? []).map((r) => fromRow(r as unknown as Record<string, unknown>, spec));
      }),
    );
    return snap;
  }

  async upsert<K extends CollectionName>(c: K, items: Collections[K][]): Promise<void> {
    const sb = getSupabase();
    const spec = TABLES[c];
    const mapped = items.map((i) => toRow(i as unknown as Record<string, unknown>, spec));
    const { error } = await sb.from(spec.table).upsert(mapped.map((m) => m.row));
    if (error) throw new Error(error.message);
    if (!spec.child) return;
    for (let i = 0; i < items.length; i++) {
      const children = mapped[i].children ?? [];
      const parentId = (items[i] as { id: string }).id;
      if (children.length) {
        const { error: e1 } = await sb.from(spec.child.table).upsert(children);
        if (e1) throw new Error(e1.message);
      }
      // remove filhos que não existem mais
      let del = sb.from(spec.child.table).delete().eq(spec.child.fk, parentId);
      if (children.length) del = del.not('id', 'in', `(${children.map((ch) => ch.id).join(',')})`);
      const { error: e2 } = await del;
      if (e2) throw new Error(e2.message);
    }
  }

  async remove(c: CollectionName, ids: string[]): Promise<void> {
    const { error } = await getSupabase().from(TABLES[c].table).delete().in('id', ids);
    if (error) throw new Error(error.message);
  }

  async loadProfile(): Promise<Profile> {
    const { data, error } = await getSupabase().from('profiles').select('*').eq('id', this.userId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return defaultProfile(this.userId);
    return {
      id: data.id,
      displayName: data.display_name,
      timezone: data.timezone,
      currency: 'BRL',
      locale: 'pt-BR',
      defaultReminderMinutes: data.default_reminder_minutes,
      weekStartsOn: data.week_starts_on,
      notifications: data.notifications,
      onboardedAt: data.onboarded_at,
      updatedAt: data.updated_at,
    };
  }

  async saveProfile(p: Profile): Promise<void> {
    const { error } = await getSupabase()
      .from('profiles')
      .update({ display_name: p.displayName, timezone: p.timezone, default_reminder_minutes: p.defaultReminderMinutes, week_starts_on: p.weekStartsOn, notifications: p.notifications, onboarded_at: p.onboardedAt })
      .eq('id', this.userId);
    if (error) throw new Error(error.message);
  }
}
