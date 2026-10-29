// Entidades de domínio do Northline. Datas de calendário usam "yyyy-mm-dd" (DateKey),
// instantes usam ISO 8601 em UTC e valores monetários usam centavos inteiros.

export type ID = string;
export type DateKey = string; // yyyy-mm-dd
export type TimeOfDay = string; // HH:mm

export type RecurrenceFreq = 'daily' | 'weekly' | 'monthly' | 'yearly';
export interface Recurrence {
  freq: RecurrenceFreq;
  interval: number;
  byWeekday?: number[]; // 0 = domingo
  until?: DateKey | null;
  count?: number | null;
}

export interface Timestamps {
  createdAt: string;
  updatedAt: string;
}

export type EventCategory = 'work' | 'study' | 'personal' | 'meeting' | 'health' | 'other';
export type EventSource = 'northline' | 'assistant' | 'google' | 'task' | 'workout';
export type SyncStatus = 'local' | 'pending' | 'synced' | 'conflict' | 'error';

export interface CalendarEvent extends Timestamps {
  id: ID;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  timezone: string;
  location: string | null;
  meetingUrl: string | null;
  category: EventCategory;
  color: string | null;
  reminderMinutes: number | null; // null = sem lembrete, 0 = no horário
  recurrence: Recurrence | null;
  recurrenceExceptions: string[]; // ISO do início original das ocorrências removidas
  recurringEventId: ID | null; // ocorrência editada isoladamente
  originalStartAt: string | null;
  status: 'confirmed' | 'cancelled';
  source: EventSource;
  externalId: string | null;
  externalEtag: string | null;
  syncStatus: SyncStatus;
  taskId: ID | null;
}

export interface EventOccurrence {
  key: string;
  event: CalendarEvent;
  start: Date;
  end: Date;
  isRecurring: boolean;
}

export type Priority = 'low' | 'medium' | 'high';

export interface Subtask {
  id: ID;
  title: string;
  done: boolean;
  position: number;
}

export interface Task extends Timestamps {
  id: ID;
  title: string;
  description: string | null;
  dueDate: DateKey | null;
  dueTime: TimeOfDay | null;
  priority: Priority;
  category: EventCategory;
  tags: string[];
  listId: ID | null;
  recurrence: Recurrence | null;
  reminderMinutes: number | null;
  completedAt: string | null;
  eventId: ID | null;
  subtasks: Subtask[];
}

export interface TaskList extends Timestamps {
  id: ID;
  name: string;
  color: string | null;
}

export type HabitFrequency = 'daily' | 'weekly';

export interface Habit extends Timestamps {
  id: ID;
  name: string;
  description: string | null;
  icon: string;
  frequency: HabitFrequency;
  weekdays: number[]; // dias programados quando frequency = daily
  dailyTarget: number; // repetições por dia
  weeklyTarget: number | null; // dias por semana quando frequency = weekly
  time: TimeOfDay | null;
  reminderEnabled: boolean;
  startDate: DateKey;
  archivedAt: string | null;
}

export interface HabitLog extends Timestamps {
  id: ID;
  habitId: ID;
  date: DateKey;
  count: number;
}

export interface RoutineExercise {
  id: ID;
  name: string;
  muscleGroup: string;
  sets: number;
  reps: number;
  weightKg: number | null;
  restSeconds: number | null;
  notes: string | null;
  position: number;
}

export interface WorkoutRoutine extends Timestamps {
  id: ID;
  name: string;
  notes: string | null;
  muscleGroups: string[];
  scheduleWeekdays: number[];
  scheduleTime: TimeOfDay | null;
  exercises: RoutineExercise[];
}

export interface SessionSet {
  id: ID;
  exerciseName: string;
  muscleGroup: string;
  setIndex: number;
  reps: number;
  weightKg: number | null;
  done: boolean;
  position: number;
}

export interface WorkoutSession extends Timestamps {
  id: ID;
  routineId: ID | null;
  name: string;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  notes: string | null;
  sets: SessionSet[];
}

export type AccountType = 'checking' | 'savings' | 'cash' | 'credit' | 'investment' | 'other';

export interface FinanceAccount extends Timestamps {
  id: ID;
  name: string;
  type: AccountType;
  initialBalanceCents: number;
  archivedAt: string | null;
}

export type TransactionType = 'income' | 'expense' | 'transfer';

export interface Transaction extends Timestamps {
  id: ID;
  accountId: ID | null;
  transferAccountId: ID | null;
  type: TransactionType;
  amountCents: number; // sempre positivo; o tipo define o sinal
  category: string;
  description: string | null;
  date: DateKey;
  paymentMethod: string | null;
  recurringId: ID | null;
}

export interface RecurringTransaction extends Timestamps {
  id: ID;
  accountId: ID | null;
  type: 'income' | 'expense';
  amountCents: number;
  category: string;
  description: string | null;
  paymentMethod: string | null;
  recurrence: Recurrence;
  startDate: DateKey;
  active: boolean;
}

export interface GoalContribution {
  id: ID;
  amountCents: number;
  date: DateKey;
}

export interface SavingsGoal extends Timestamps {
  id: ID;
  name: string;
  targetCents: number;
  targetDate: DateKey | null;
  contributions: GoalContribution[];
  archivedAt: string | null;
}

export interface NotificationPrefs {
  events: boolean;
  tasks: boolean;
  habits: boolean;
  workouts: boolean;
}

export interface Profile {
  id: ID;
  displayName: string;
  timezone: string;
  currency: 'BRL';
  locale: 'pt-BR';
  defaultReminderMinutes: number | null;
  weekStartsOn: 0 | 1;
  notifications: NotificationPrefs;
  onboardedAt: string | null;
  updatedAt: string;
}
