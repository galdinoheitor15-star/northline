import type { EventDraft } from './events';
import type { DateKey, EventCategory, Priority, TimeOfDay } from './types';

// Propostas são sugestões do assistente. Nada é gravado até o usuário confirmar
// e a camada de dados (com RLS no backend) aceitar a operação.

interface Base {
  id: string;
  summary: string;
  warnings: string[];
}

export interface ConflictInfo {
  title: string;
  startAt: string;
  endAt: string;
}

export type Proposal =
  | (Base & { kind: 'create_event'; draft: EventDraft; conflicts: ConflictInfo[] })
  | (Base & {
      kind: 'update_event';
      eventId: string;
      occurrenceStart: string | null;
      before: { title: string; startAt: string; endAt: string };
      after: { startAt: string; endAt: string; title: string };
      conflicts: ConflictInfo[];
    })
  | (Base & { kind: 'cancel_event'; eventId: string; occurrenceStart: string | null; title: string; startAt: string })
  | (Base & {
      kind: 'create_task';
      task: { title: string; dueDate: DateKey | null; dueTime: TimeOfDay | null; priority: Priority; category: EventCategory; reminderMinutes: number | null };
    })
  | (Base & {
      kind: 'create_transaction';
      tx: { type: 'income' | 'expense'; amountCents: number; category: string; description: string | null; date: DateKey; accountId: string | null };
    })
  | (Base & { kind: 'log_habit'; habitId: string; habitName: string; date: DateKey })
  | (Base & { kind: 'log_workout'; routineId: string | null; name: string });

export type ProposalKind = Proposal['kind'];

export interface AssistantReply {
  reply: string;
  proposals: Proposal[];
  /** Quando falta informação, o assistente guarda o pedido parcial e pergunta. */
  pending?: PendingRequest | null;
  engine: 'local' | 'ai';
}

export interface PendingRequest {
  text: string; // pedido original
  missing: 'time' | 'amount' | 'date' | 'target';
}
