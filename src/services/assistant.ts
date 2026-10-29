import { interpretLocally } from '@/domain/assistant-local';
import type { AssistantReply, PendingRequest } from '@/domain/proposals';
import { isSupabaseConfigured } from '@/lib/env';
import { newId } from '@/lib/id';
import { callFunction, FunctionError } from '@/lib/supabase';
import { useData } from '@/state/data';
import { useSession } from '@/state/session';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

function local(text: string, pending: PendingRequest | null): AssistantReply {
  const d = useData.getState();
  return interpretLocally(text, {
    now: new Date(),
    tz: d.profile.timezone,
    events: d.events,
    tasks: d.tasks,
    habits: d.habits,
    habitLogs: d.habitLogs,
    transactions: d.transactions,
    accounts: d.accounts,
    routines: d.routines,
    sessions: d.sessions,
    defaultReminderMinutes: d.profile.defaultReminderMinutes,
    pending,
    newId,
  });
}

export const aiAvailable = () => isSupabaseConfigured && useSession.getState().mode === 'supabase';

/**
 * Envia o pedido ao assistente com IA (Edge Function "assistant"), que só consulta dados
 * pelas ferramentas controladas e devolve PROPOSTAS. Sem backend ou em falha, usa o
 * interpretador local e avisa o usuário.
 */
export async function askAssistant(text: string, history: ChatTurn[], pending: PendingRequest | null): Promise<AssistantReply & { notice?: string }> {
  if (!aiAvailable()) return local(text, pending);
  try {
    const d = useData.getState();
    const res = await callFunction<AssistantReply>('assistant', {
      message: text.slice(0, 2000),
      history: history.slice(-10).map((h) => ({ role: h.role, content: h.content.slice(0, 2000) })),
      timezone: d.profile.timezone,
      pending,
    });
    return { ...res, engine: 'ai' };
  } catch (e) {
    const reason = e instanceof FunctionError ? (e.code === 'rate_limited' ? 'limite diário atingido' : e.code === 'not_configured' ? 'IA não configurada no servidor' : e.message) : 'falha de conexão';
    return { ...local(text, pending), notice: `Assistente com IA indisponível (${reason}). Usei a interpretação local.` };
  }
}
