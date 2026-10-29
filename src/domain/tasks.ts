import { nextDate } from './recurrence';
import { addDaysKey, startOfWeekKey } from './time';
import type { DateKey, Priority, Task } from './types';

export const PRIORITIES: { id: Priority; label: string }[] = [
  { id: 'high', label: 'Alta' },
  { id: 'medium', label: 'Média' },
  { id: 'low', label: 'Baixa' },
];

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export const isDone = (t: Task) => t.completedAt != null;

export function isOverdue(t: Task, today: DateKey, nowTime?: string): boolean {
  if (isDone(t) || !t.dueDate) return false;
  if (t.dueDate < today) return true;
  if (t.dueDate === today && t.dueTime && nowTime) return t.dueTime < nowTime;
  return false;
}

export type TaskBucket = 'today' | 'upcoming' | 'overdue' | 'done' | 'someday';

export function bucketOf(t: Task, today: DateKey): TaskBucket {
  if (isDone(t)) return 'done';
  if (!t.dueDate) return 'someday';
  if (t.dueDate < today) return 'overdue';
  if (t.dueDate === today) return 'today';
  return 'upcoming';
}

export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (isDone(a) !== isDone(b)) return isDone(a) ? 1 : -1;
    const da = (a.dueDate ?? '9999-12-31') + (a.dueTime ?? '99:99');
    const db = (b.dueDate ?? '9999-12-31') + (b.dueTime ?? '99:99');
    if (da !== db) return da < db ? -1 : 1;
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  });
}

export interface TaskSummary {
  total: number;
  done: number;
  pending: number;
  overdue: number;
  progress: number; // 0..1
}

/**
 * Resumo do dia: tarefas com vencimento hoje (concluídas ou não), tarefas concluídas hoje
 * e tarefas atrasadas pendentes. `completedToday` usa o dia local da conclusão.
 */
export function daySummary(tasks: Task[], today: DateKey, completedOn: (t: Task) => DateKey | null): TaskSummary {
  const relevant = tasks.filter((t) => t.dueDate === today || (isDone(t) && completedOn(t) === today) || (!isDone(t) && t.dueDate && t.dueDate < today));
  const done = relevant.filter(isDone).length;
  const overdue = relevant.filter((t) => !isDone(t) && t.dueDate! < today).length;
  const total = relevant.length;
  return { total, done, pending: total - done, overdue, progress: total ? done / total : 0 };
}

export function weekProgress(tasks: Task[], today: DateKey, weekStartsOn: 0 | 1): { total: number; done: number } {
  const start = startOfWeekKey(today, weekStartsOn);
  const end = addDaysKey(start, 6);
  const inWeek = tasks.filter((t) => t.dueDate && t.dueDate >= start && t.dueDate <= end);
  return { total: inWeek.length, done: inWeek.filter(isDone).length };
}

/**
 * Concluir uma tarefa recorrente gera a próxima instância (sem duplicar quando já existe).
 */
export function completeTask(task: Task, nowIso: string, todayKey: DateKey, newId: () => string, existing: Task[]): { updated: Task; next: Task | null } {
  const updated: Task = { ...task, completedAt: nowIso, updatedAt: nowIso };
  if (!task.recurrence || !task.dueDate) return { updated, next: null };
  // a próxima instância nunca cai no passado: se a tarefa estava atrasada, avança até hoje
  let nd = nextDate(task.dueDate, task.recurrence, task.dueDate);
  while (nd && nd < todayKey && !task.recurrence.count) nd = nextDate(task.dueDate, task.recurrence, nd);
  if (!nd) return { updated, next: null };
  const duplicate = existing.find((t) => t.id !== task.id && t.title === task.title && t.dueDate === nd && !isDone(t));
  if (duplicate) return { updated, next: null };
  const remainingCount = task.recurrence.count ? task.recurrence.count - 1 : null;
  if (remainingCount === 0) return { updated, next: null };
  const next: Task = {
    ...task,
    id: newId(),
    dueDate: nd,
    completedAt: null,
    eventId: null,
    recurrence: { ...task.recurrence, count: remainingCount },
    subtasks: task.subtasks.map((s) => ({ ...s, id: newId(), done: false })),
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  return { updated, next };
}

export function uncompleteTask(task: Task, nowIso: string): Task {
  return { ...task, completedAt: null, updatedAt: nowIso };
}

export function matchesSearch(t: Task, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return t.title.toLowerCase().includes(s) || (t.description ?? '').toLowerCase().includes(s) || t.tags.some((g) => g.toLowerCase().includes(s));
}
