import type {
  CalendarEvent, FinanceAccount, Habit, HabitLog, RecurringTransaction, SavingsGoal, Task, TaskList, Transaction, WorkoutRoutine, WorkoutSession,
} from '@/domain/types';

export interface Collections {
  events: CalendarEvent;
  tasks: Task;
  taskLists: TaskList;
  habits: Habit;
  habitLogs: HabitLog;
  routines: WorkoutRoutine;
  sessions: WorkoutSession;
  accounts: FinanceAccount;
  transactions: Transaction;
  recurring: RecurringTransaction;
  goals: SavingsGoal;
}

export type CollectionName = keyof Collections;
export const COLLECTIONS: CollectionName[] = ['events', 'tasks', 'taskLists', 'habits', 'habitLogs', 'routines', 'sessions', 'accounts', 'transactions', 'recurring', 'goals'];

export interface TableSpec {
  table: string;
  /** coleção filha guardada em tabela própria (ex.: subtarefas) */
  child?: { key: string; table: string; fk: string };
  /** colunas do tipo time (o Postgres devolve HH:MM:SS) */
  timeColumns?: string[];
  /** colunas numeric que podem voltar como string */
  numericColumns?: string[];
}

export const TABLES: Record<CollectionName, TableSpec> = {
  events: { table: 'events' },
  tasks: { table: 'tasks', child: { key: 'subtasks', table: 'subtasks', fk: 'task_id' }, timeColumns: ['due_time'] },
  taskLists: { table: 'task_lists' },
  habits: { table: 'habits', timeColumns: ['time'] },
  habitLogs: { table: 'habit_logs' },
  routines: { table: 'workout_routines', child: { key: 'exercises', table: 'routine_exercises', fk: 'routine_id' }, timeColumns: ['schedule_time'], numericColumns: ['weight_kg'] },
  sessions: { table: 'workout_sessions', child: { key: 'sets', table: 'session_sets', fk: 'session_id' }, numericColumns: ['weight_kg'] },
  accounts: { table: 'finance_accounts' },
  transactions: { table: 'transactions' },
  recurring: { table: 'recurring_transactions' },
  goals: { table: 'savings_goals', child: { key: 'contributions', table: 'goal_contributions', fk: 'goal_id' } },
};
