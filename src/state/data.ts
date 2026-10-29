import { create } from 'zustand';
import { COLLECTIONS, type CollectionName, type Collections } from '@/data/collections';
import { defaultProfile, emptySnapshot, type Repository, type Snapshot } from '@/data/repository';
import { materializeRecurring } from '@/domain/finance';
import { toDateKey } from '@/domain/time';
import type { Profile } from '@/domain/types';
import { newId, nowIso } from '@/lib/id';

type Status = 'idle' | 'loading' | 'ready' | 'error';

interface DataState extends Snapshot {
  status: Status;
  error: string | null;
  profile: Profile;
  repo: Repository | null;
  /** incrementa a cada alteração; usado para reagendar notificações */
  revision: number;
  hydrate(repo: Repository): Promise<void>;
  reset(): void;
  save<K extends CollectionName>(c: K, items: Collections[K] | Collections[K][]): Promise<boolean>;
  remove(c: CollectionName, ids: string | string[]): Promise<boolean>;
  updateProfile(patch: Partial<Profile>): Promise<boolean>;
}

let onError: (msg: string) => void = () => {};
export function setDataErrorHandler(fn: (msg: string) => void) {
  onError = fn;
}

export const useData = create<DataState>((set, get) => ({
  ...emptySnapshot(),
  status: 'idle',
  error: null,
  profile: defaultProfile('anon'),
  repo: null,
  revision: 0,

  async hydrate(repo) {
    set({ status: 'loading', error: null, repo });
    try {
      const [snap, profile] = await Promise.all([repo.loadAll(), repo.loadProfile()]);
      set({ ...snap, profile, status: 'ready', revision: get().revision + 1 });
      // lançamentos recorrentes vencidos são materializados uma única vez (idempotente)
      const due = materializeRecurring(snap.recurring, snap.transactions, toDateKey(new Date(), profile.timezone), nowIso(), newId);
      if (due.length) await get().save('transactions', due);
    } catch (e) {
      set({ status: 'error', error: (e as Error).message });
    }
  },

  reset() {
    set({ ...emptySnapshot(), status: 'idle', error: null, repo: null, profile: defaultProfile('anon') });
  },

  // Atualização otimista: a tela muda na hora; se o backend recusar, desfaz e avisa.
  async save(c, input) {
    const items = (Array.isArray(input) ? input : [input]) as Collections[typeof c][];
    const repo = get().repo;
    if (!repo) return false;
    const prev = get()[c] as Collections[typeof c][];
    const next = [...prev];
    for (const it of items) {
      const i = next.findIndex((x) => x.id === it.id);
      if (i >= 0) next[i] = it;
      else next.push(it);
    }
    set({ [c]: next, revision: get().revision + 1 } as Partial<DataState>);
    try {
      await repo.upsert(c, items);
      return true;
    } catch (e) {
      set({ [c]: prev, revision: get().revision + 1 } as Partial<DataState>);
      onError(`Não foi possível salvar: ${(e as Error).message}`);
      return false;
    }
  },

  async remove(c, input) {
    const ids = Array.isArray(input) ? input : [input];
    const repo = get().repo;
    if (!repo) return false;
    const prev = get()[c] as { id: string }[];
    set({ [c]: prev.filter((x) => !ids.includes(x.id)), revision: get().revision + 1 } as Partial<DataState>);
    try {
      await repo.remove(c, ids);
      return true;
    } catch (e) {
      set({ [c]: prev, revision: get().revision + 1 } as Partial<DataState>);
      onError(`Não foi possível excluir: ${(e as Error).message}`);
      return false;
    }
  },

  async updateProfile(patch) {
    const repo = get().repo;
    const prev = get().profile;
    const next = { ...prev, ...patch, updatedAt: nowIso() };
    set({ profile: next, revision: get().revision + 1 });
    try {
      await repo?.saveProfile(next);
      return true;
    } catch (e) {
      set({ profile: prev });
      onError(`Não foi possível salvar o perfil: ${(e as Error).message}`);
      return false;
    }
  },
}));

export const allCollections = COLLECTIONS;
