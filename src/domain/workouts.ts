import { addDaysKey, toDateKey, toTimeOfDay, weekdayOfKey } from './time';
import type { DateKey, SessionSet, WorkoutRoutine, WorkoutSession } from './types';

export const MUSCLE_GROUPS = ['Peito', 'Costas', 'Ombros', 'Bíceps', 'Tríceps', 'Pernas', 'Glúteos', 'Abdômen', 'Panturrilha', 'Cardio', 'Corpo inteiro'];

export interface ScheduledWorkout {
  routine: WorkoutRoutine;
  date: DateKey;
  time: string | null;
}

/** Próximo treino programado (hoje ainda conta se o horário não passou ou não foi registrado). */
export function nextScheduledWorkout(routines: WorkoutRoutine[], sessions: WorkoutSession[], now: Date, tz: string): ScheduledWorkout | null {
  const today = toDateKey(now, tz);
  const nowTime = toTimeOfDay(now, tz);
  let best: ScheduledWorkout | null = null;
  for (const r of routines) {
    if (!r.scheduleWeekdays.length) continue;
    for (let i = 0; i < 8; i++) {
      const date = addDaysKey(today, i);
      if (!r.scheduleWeekdays.includes(weekdayOfKey(date))) continue;
      if (i === 0) {
        const doneToday = sessions.some((s) => s.routineId === r.id && toDateKey(new Date(s.startedAt), tz) === today);
        if (doneToday) continue;
        if (r.scheduleTime && r.scheduleTime < nowTime) continue;
      }
      const cand = { routine: r, date, time: r.scheduleTime };
      if (!best || date + (cand.time ?? '99') < best.date + (best.time ?? '99')) best = cand;
      break;
    }
  }
  return best;
}

export function lastSession(sessions: WorkoutSession[]): WorkoutSession | null {
  const done = sessions.filter((s) => s.endedAt);
  if (!done.length) return null;
  return done.reduce((a, b) => (a.startedAt > b.startedAt ? a : b));
}

/** Último desempenho registrado de um exercício (melhor série da sessão mais recente). */
export function lastPerformance(sessions: WorkoutSession[], exerciseName: string, excludeSessionId?: string): { date: string; reps: number; weightKg: number | null; sets: number } | null {
  const name = exerciseName.trim().toLowerCase();
  const sorted = sessions.filter((s) => s.id !== excludeSessionId && s.endedAt).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  for (const s of sorted) {
    const sets = s.sets.filter((x) => x.done && x.exerciseName.trim().toLowerCase() === name);
    if (!sets.length) continue;
    const top = sets.reduce((a, b) => ((b.weightKg ?? 0) > (a.weightKg ?? 0) || ((b.weightKg ?? 0) === (a.weightKg ?? 0) && b.reps > a.reps) ? b : a));
    return { date: s.startedAt, reps: top.reps, weightKg: top.weightKg, sets: sets.length };
  }
  return null;
}

export function sessionVolumeKg(s: WorkoutSession): number {
  return s.sets.filter((x) => x.done).reduce((a, x) => a + x.reps * (x.weightKg ?? 0), 0);
}

/** Série histórica da maior carga por sessão para um exercício (evolução). */
export function exerciseProgress(sessions: WorkoutSession[], exerciseName: string): { date: string; maxWeightKg: number; reps: number }[] {
  const name = exerciseName.trim().toLowerCase();
  return sessions
    .filter((s) => s.endedAt)
    .map((s) => {
      const sets = s.sets.filter((x) => x.done && x.exerciseName.trim().toLowerCase() === name);
      if (!sets.length) return null;
      const top = sets.reduce((a, b) => ((b.weightKg ?? 0) >= (a.weightKg ?? 0) ? b : a));
      return { date: s.startedAt, maxWeightKg: top.weightKg ?? 0, reps: top.reps };
    })
    .filter((x): x is { date: string; maxWeightKg: number; reps: number } => x !== null)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Monta as séries de uma nova sessão a partir da rotina, usando a última carga registrada quando houver. */
export function setsFromRoutine(r: WorkoutRoutine, sessions: WorkoutSession[], newId: () => string): SessionSet[] {
  const out: SessionSet[] = [];
  let pos = 0;
  for (const ex of [...r.exercises].sort((a, b) => a.position - b.position)) {
    const last = lastPerformance(sessions, ex.name);
    for (let i = 0; i < ex.sets; i++) {
      out.push({ id: newId(), exerciseName: ex.name, muscleGroup: ex.muscleGroup, setIndex: i + 1, reps: ex.reps, weightKg: last?.weightKg ?? ex.weightKg, done: false, position: pos++ });
    }
  }
  return out;
}

/** Copia uma sessão anterior para registrar um novo treino. */
export function copySessionSets(s: WorkoutSession, newId: () => string): SessionSet[] {
  return s.sets.map((x) => ({ ...x, id: newId(), done: false }));
}

export function groupSets(sets: SessionSet[]): { exerciseName: string; muscleGroup: string; sets: SessionSet[] }[] {
  const groups: { exerciseName: string; muscleGroup: string; sets: SessionSet[] }[] = [];
  for (const s of [...sets].sort((a, b) => a.position - b.position)) {
    const g = groups.find((x) => x.exerciseName === s.exerciseName);
    if (g) g.sets.push(s);
    else groups.push({ exerciseName: s.exerciseName, muscleGroup: s.muscleGroup, sets: [s] });
  }
  return groups;
}
