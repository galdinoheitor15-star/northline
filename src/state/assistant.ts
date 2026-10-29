import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { PendingRequest, Proposal } from '@/domain/proposals';
import { askAssistant } from '@/services/assistant';
import { newId, nowIso } from '@/lib/id';
import { getSupabase } from '@/lib/supabase';
import { executeProposal, type ExecutionResult } from './actions';
import { useSession } from './session';

export type ProposalStatus = 'suggested' | 'running' | 'done' | 'dismissed' | 'failed';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  engine?: 'local' | 'ai';
  notice?: string;
  proposals?: Proposal[];
  status?: Record<string, { state: ProposalStatus; message?: string }>;
}

interface AssistantState {
  messages: ChatMessage[];
  pending: PendingRequest | null;
  busy: boolean;
  loaded: boolean;
  load(): Promise<void>;
  send(text: string): Promise<void>;
  updateProposal(messageId: string, proposal: Proposal): void;
  confirm(messageId: string, proposalId: string): Promise<ExecutionResult | null>;
  dismiss(messageId: string, proposalId: string): void;
  clear(): Promise<void>;
}

const MAX_LOCAL = 100;
const key = () => `nl:${useSession.getState().mode ?? 'none'}:assistant`;

async function persist(messages: ChatMessage[], changed: ChatMessage[]) {
  const mode = useSession.getState().mode;
  if (mode === 'supabase') {
    // histórico por usuário no banco (RLS); retenção de 90 dias pela função purge_old_assistant_data
    const rows = changed.map((m) => ({ id: m.id, role: m.role, content: m.content.slice(0, 8000), engine: m.engine ?? null, payload: { proposals: m.proposals ?? [], status: m.status ?? {}, notice: m.notice ?? null } }));
    await getSupabase().from('assistant_messages').upsert(rows).then(() => {}, () => {});
  } else {
    await AsyncStorage.setItem(key(), JSON.stringify(messages.slice(-MAX_LOCAL))).catch(() => {});
  }
}

export const useAssistant = create<AssistantState>((set, get) => ({
  messages: [],
  pending: null,
  busy: false,
  loaded: false,

  async load() {
    if (get().loaded) return;
    const mode = useSession.getState().mode;
    try {
      if (mode === 'supabase') {
        const { data } = await getSupabase().from('assistant_messages').select('id, role, content, engine, payload, created_at').order('created_at', { ascending: false }).limit(60);
        const msgs: ChatMessage[] = (data ?? []).reverse().map((r) => ({ id: r.id, role: r.role, content: r.content, engine: r.engine ?? undefined, createdAt: r.created_at, proposals: r.payload?.proposals, status: r.payload?.status, notice: r.payload?.notice ?? undefined }));
        set({ messages: msgs, loaded: true });
      } else {
        const raw = await AsyncStorage.getItem(key());
        set({ messages: raw ? JSON.parse(raw) : [], loaded: true });
      }
    } catch {
      set({ loaded: true });
    }
  },

  async send(text) {
    const content = text.trim();
    if (!content || get().busy) return;
    const user: ChatMessage = { id: newId(), role: 'user', content, createdAt: nowIso() };
    set((s) => ({ messages: [...s.messages, user], busy: true }));
    try {
      const history = get().messages.slice(0, -1).map((m) => ({ role: m.role, content: m.content }));
      const r = await askAssistant(content, history, get().pending);
      const reply: ChatMessage = {
        id: newId(),
        role: 'assistant',
        content: r.reply,
        createdAt: nowIso(),
        engine: r.engine,
        notice: r.notice,
        proposals: r.proposals,
        status: Object.fromEntries(r.proposals.map((p) => [p.id, { state: 'suggested' as ProposalStatus }])),
      };
      set((s) => ({ messages: [...s.messages, reply], pending: r.pending ?? null }));
      await persist(get().messages, [user, reply]);
    } catch (e) {
      const err: ChatMessage = { id: newId(), role: 'assistant', content: `Algo deu errado: ${(e as Error).message}`, createdAt: nowIso(), engine: 'local' };
      set((s) => ({ messages: [...s.messages, err] }));
    } finally {
      set({ busy: false });
    }
  },

  updateProposal(messageId, proposal) {
    set((s) => ({ messages: s.messages.map((m) => (m.id === messageId ? { ...m, proposals: m.proposals?.map((p) => (p.id === proposal.id ? proposal : p)) } : m)) }));
  },

  async confirm(messageId, proposalId) {
    const msg = get().messages.find((m) => m.id === messageId);
    const proposal = msg?.proposals?.find((p) => p.id === proposalId);
    if (!msg || !proposal || msg.status?.[proposalId]?.state === 'done') return null;
    const setStatus = (state: ProposalStatus, message?: string) =>
      set((s) => ({ messages: s.messages.map((m) => (m.id === messageId ? { ...m, status: { ...m.status, [proposalId]: { state, message } } } : m)) }));
    setStatus('running');
    const result = await executeProposal(proposal);
    setStatus(result.ok ? 'done' : 'failed', result.message);
    const updated = get().messages.find((m) => m.id === messageId)!;
    await persist(get().messages, [updated]);
    return result;
  },

  dismiss(messageId, proposalId) {
    set((s) => ({ messages: s.messages.map((m) => (m.id === messageId ? { ...m, status: { ...m.status, [proposalId]: { state: 'dismissed' } } } : m)) }));
    const updated = get().messages.find((m) => m.id === messageId);
    if (updated) void persist(get().messages, [updated]);
  },

  async clear() {
    const mode = useSession.getState().mode;
    if (mode === 'supabase') await getSupabase().from('assistant_messages').delete().not('id', 'is', null).then(() => {}, () => {});
    else await AsyncStorage.removeItem(key());
    set({ messages: [], pending: null });
  },
}));

/** Limpa o estado em memória ao sair da conta. */
useSession.subscribe((s, prev) => {
  if (s.mode !== prev.mode) useAssistant.setState({ messages: [], pending: null, loaded: false });
});
