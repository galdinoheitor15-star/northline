import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { callFunction, getSupabase } from '@/lib/supabase';
import { useData } from '@/state/data';
import { useIntegrations } from '@/state/integrations';

// O fluxo OAuth acontece no backend: o app só abre a URL de consentimento do Google.
// O client secret e os tokens nunca chegam ao aparelho.

export async function connectGoogle(): Promise<'connected' | 'cancelled' | 'error'> {
  const returnTo = Linking.createURL('/settings/connections');
  const { url } = await callFunction<{ url: string }>('google-oauth', { action: 'start', returnTo });
  const result = await WebBrowser.openAuthSessionAsync(url, returnTo);
  await useIntegrations.getState().refresh();
  if (result.type === 'success') {
    const status = new URL(result.url).searchParams.get('google');
    return status === 'connected' ? 'connected' : 'error';
  }
  // na web a janela pode ter concluído sem retornar o resultado: confia no estado do backend
  return useIntegrations.getState().googleConnected ? 'connected' : 'cancelled';
}

export async function disconnectGoogle(): Promise<void> {
  await callFunction('google-oauth', { action: 'disconnect' });
  await useIntegrations.getState().refresh();
}

export interface SyncSummary {
  imported: number;
  updated: number;
  pushed: number;
  deleted: number;
  conflicts: number;
  fullResync: boolean;
}

export async function syncGoogle(): Promise<SyncSummary> {
  const res = await callFunction<SyncSummary>('google-sync', { action: 'sync' }, { timeoutMs: 90_000 });
  const repo = useData.getState().repo;
  if (repo) await useData.getState().hydrate(repo);
  await useIntegrations.getState().refresh();
  return res;
}

export interface ConflictRow {
  id: string;
  event_id: string;
  local_snapshot: { title: string; startAt: string; endAt: string };
  remote_snapshot: { title: string; startAt: string; endAt: string };
  created_at: string;
}

export async function listConflicts(): Promise<ConflictRow[]> {
  const { data, error } = await getSupabase().from('sync_conflicts').select('id, event_id, local_snapshot, remote_snapshot, created_at').is('resolved_at', null).order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as ConflictRow[];
}

export async function resolveConflict(conflictId: string, resolution: 'keep_local' | 'keep_remote'): Promise<void> {
  await callFunction('google-sync', { action: 'resolve', conflictId, resolution });
  const repo = useData.getState().repo;
  if (repo) await useData.getState().hydrate(repo);
  await useIntegrations.getState().refresh();
}
