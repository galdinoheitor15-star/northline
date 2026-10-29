import { create } from 'zustand';
import { isSupabaseConfigured } from '@/lib/env';
import { getSupabase } from '@/lib/supabase';

export interface GoogleStatus {
  status: 'connected' | 'revoked' | 'error';
  accountEmail: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
}

interface IntegrationsState {
  googleConnected: boolean;
  google: GoogleStatus | null;
  conflicts: number;
  refresh(): Promise<void>;
}

/** Estado das integrações (sem segredos: os tokens ficam só no backend). */
export const useIntegrations = create<IntegrationsState>((set) => ({
  googleConnected: false,
  google: null,
  conflicts: 0,
  async refresh() {
    if (!isSupabaseConfigured) return;
    const sb = getSupabase();
    const { data } = await sb.from('integrations').select('status, account_email, last_sync_at, last_error').eq('provider', 'google_calendar').maybeSingle();
    const { count } = await sb.from('sync_conflicts').select('id', { count: 'exact', head: true }).is('resolved_at', null);
    set({
      google: data ? { status: data.status, accountEmail: data.account_email, lastSyncAt: data.last_sync_at, lastError: data.last_error } : null,
      googleConnected: data?.status === 'connected',
      conflicts: count ?? 0,
    });
  },
}));
