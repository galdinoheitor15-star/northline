// Conjunto de dados de DEMONSTRAÇÃO. Fica num espaço de armazenamento separado ("demo"),
// nunca é enviado ao Supabase e a interface mostra uma faixa "Demonstração" enquanto ativo.
import { addDaysKey, toDateKey, weekdayOfKey, zonedToUtc, DEFAULT_TZ } from '@/domain/time';
import type { CalendarEvent, Habit, HabitLog, Profile, Task, Transaction, WorkoutRoutine, WorkoutSession } from '@/domain/types';
import { newId } from '@/lib/id';
import { defaultProfile, emptySnapshot, type Snapshot } from './repository';

export function buildDemoData(now: Date): { snapshot: Snapshot; profile: Profile } {
  const tz = DEFAULT_TZ;
  const today = toDateKey(now, tz);
  const ts = now.toISOString();
  const snap = emptySnapshot();
  const base = { createdAt: ts, updatedAt: ts };

  const ev = (date: string, start: string, minutes: number, title: string, category: CalendarEvent['category'], extra: Partial<CalendarEvent> = {}): CalendarEvent => {
    const s = zonedToUtc(date, start, tz);
    return {
      id: newId(), title, description: null, startAt: s.toISOString(), endAt: new Date(s.getTime() + minutes * 60_000).toISOString(), allDay: false, timezone: tz,
      location: null, meetingUrl: null, category, color: null, reminderMinutes: 10, recurrence: null, recurrenceExceptions: [], recurringEventId: null,
      originalStartAt: null, status: 'confirmed', source: 'northline', externalId: null, externalEtag: null, syncStatus: 'local', taskId: null, ...base, ...extra,
    };
  };
  snap.events = [
    ev(today, '09:00', 30, 'Daily com o time', 'meeting', { recurrence: { freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5] }, meetingUrl: 'https://meet.google.com/demo' }),
    ev(today, '14:00', 60, 'Revisão do projeto', 'work'),
    ev(today, '19:00', 90, 'Estudar cálculo', 'study'),
    ev(addDaysKey(today, 1), '10:30', 60, 'Dentista', 'health', { location: 'Clínica Boa Vista' }),
    ev(addDaysKey(today, 2), '20:00', 120, 'Jantar com amigos', 'personal', { reminderMinutes: 60 }),
  ];

  const task = (title: string, dueDate: string | null, extra: Partial<Task> = {}): Task => ({
    id: newId(), title, description: null, dueDate, dueTime: null, priority: 'medium', category: 'personal', tags: [], listId: null, recurrence: null,
    reminderMinutes: null, completedAt: null, eventId: null, subtasks: [], ...base, ...extra,
  });
  snap.tasks = [
    task('Enviar relatório semanal', today, { priority: 'high', category: 'work', dueTime: '17:00', tags: ['trabalho'] }),
    task('Pagar conta de luz', addDaysKey(today, -1), { priority: 'high', tags: ['contas'] }),
    task('Ler capítulo 4', today, { category: 'study', completedAt: ts }),
    task('Comprar presente da Ana', addDaysKey(today, 3), { subtasks: [{ id: newId(), title: 'Escolher', done: true, position: 0 }, { id: newId(), title: 'Embrulhar', done: false, position: 1 }] }),
    task('Organizar arquivos', null, { priority: 'low' }),
  ];

  const habit = (name: string, icon: string, weekdays: number[], extra: Partial<Habit> = {}): Habit => ({
    id: newId(), name, description: null, icon, frequency: 'daily', weekdays, dailyTarget: 1, weeklyTarget: null, time: null, reminderEnabled: false,
    startDate: addDaysKey(today, -40), archivedAt: null, ...base, ...extra,
  });
  const read = habit('Ler 20 páginas', 'book', [0, 1, 2, 3, 4, 5, 6], { time: '21:30' });
  const water = habit('Beber 2L de água', 'droplet', [0, 1, 2, 3, 4, 5, 6], { dailyTarget: 4 });
  const gym = habit('Academia', 'dumbbell', [], { frequency: 'weekly', weeklyTarget: 4 });
  snap.habits = [read, water, gym];
  const logs: HabitLog[] = [];
  for (let i = 1; i <= 30; i++) {
    const d = addDaysKey(today, -i);
    if (i !== 6 && i !== 13) logs.push({ id: newId(), habitId: read.id, date: d, count: 1, ...base });
    if (i % 4 !== 0) logs.push({ id: newId(), habitId: water.id, date: d, count: 4, ...base });
    if ([1, 2, 4, 5].includes(weekdayOfKey(d))) logs.push({ id: newId(), habitId: gym.id, date: d, count: 1, ...base });
  }
  logs.push({ id: newId(), habitId: water.id, date: today, count: 2, ...base });
  snap.habitLogs = logs;

  const routineA: WorkoutRoutine = {
    id: newId(), name: 'Treino A — Peito e tríceps', notes: null, muscleGroups: ['Peito', 'Tríceps'], scheduleWeekdays: [1, 4], scheduleTime: '18:30', ...base,
    exercises: [
      { id: newId(), name: 'Supino reto', muscleGroup: 'Peito', sets: 4, reps: 10, weightKg: 40, restSeconds: 90, notes: null, position: 0 },
      { id: newId(), name: 'Crucifixo', muscleGroup: 'Peito', sets: 3, reps: 12, weightKg: 14, restSeconds: 60, notes: null, position: 1 },
      { id: newId(), name: 'Tríceps corda', muscleGroup: 'Tríceps', sets: 3, reps: 12, weightKg: 25, restSeconds: 60, notes: null, position: 2 },
    ],
  };
  const routineB: WorkoutRoutine = {
    id: newId(), name: 'Treino B — Costas e bíceps', notes: null, muscleGroups: ['Costas', 'Bíceps'], scheduleWeekdays: [2, 5], scheduleTime: '18:30', ...base,
    exercises: [
      { id: newId(), name: 'Puxada frontal', muscleGroup: 'Costas', sets: 4, reps: 10, weightKg: 45, restSeconds: 90, notes: null, position: 0 },
      { id: newId(), name: 'Rosca direta', muscleGroup: 'Bíceps', sets: 3, reps: 10, weightKg: 12, restSeconds: 60, notes: null, position: 1 },
    ],
  };
  snap.routines = [routineA, routineB];
  const sessions: WorkoutSession[] = [];
  for (let w = 4; w >= 1; w--) {
    const day = addDaysKey(today, -w * 7 + 1);
    const start = zonedToUtc(day, '18:30', tz);
    sessions.push({
      id: newId(), routineId: routineA.id, name: routineA.name, startedAt: start.toISOString(), endedAt: new Date(start.getTime() + 55 * 60_000).toISOString(), durationMinutes: 55, notes: null, ...base,
      sets: routineA.exercises.flatMap((ex, ei) => Array.from({ length: ex.sets }, (_, si) => ({ id: newId(), exerciseName: ex.name, muscleGroup: ex.muscleGroup, setIndex: si + 1, reps: ex.reps, weightKg: (ex.weightKg ?? 0) + (4 - w) * 2.5, done: true, position: ei * 10 + si }))),
    });
  }
  snap.sessions = sessions;

  const acc = { id: newId(), name: 'Conta corrente', type: 'checking' as const, initialBalanceCents: 1500_00, archivedAt: null, ...base };
  const savings = { id: newId(), name: 'Reserva', type: 'savings' as const, initialBalanceCents: 4000_00, archivedAt: null, ...base };
  snap.accounts = [acc, savings];
  const monthStart = today.slice(0, 8) + '01';
  const tx = (date: string, type: Transaction['type'], cents: number, category: string, description: string, extra: Partial<Transaction> = {}): Transaction => ({
    id: newId(), accountId: acc.id, transferAccountId: null, type, amountCents: cents, category, description, date: date > today ? today : date, paymentMethod: 'Pix', recurringId: null, ...base, ...extra,
  });
  snap.transactions = [
    tx(monthStart, 'income', 4200_00, 'Salário', 'Salário'),
    tx(addDaysKey(monthStart, 1), 'expense', 1300_00, 'Moradia', 'Aluguel', { paymentMethod: 'Boleto' }),
    tx(addDaysKey(monthStart, 3), 'expense', 412_37, 'Alimentação', 'Mercado do mês', { paymentMethod: 'Débito' }),
    tx(addDaysKey(monthStart, 5), 'expense', 89_90, 'Assinaturas', 'Academia'),
    tx(addDaysKey(monthStart, 7), 'expense', 56_40, 'Transporte', 'Uber'),
    tx(addDaysKey(today, -1), 'expense', 35_00, 'Alimentação', 'Almoço'),
    tx(addDaysKey(monthStart, 2), 'transfer', 500_00, 'Transferência', 'Para a reserva', { transferAccountId: savings.id }),
  ];
  snap.goals = [{ id: newId(), name: 'Viagem de fim de ano', targetCents: 5000_00, targetDate: addDaysKey(today, 60), archivedAt: null, contributions: [{ id: newId(), amountCents: 1800_00, date: addDaysKey(today, -20) }], ...base }];

  return { snapshot: snap, profile: { ...defaultProfile('demo', 'Visitante'), onboardedAt: ts } };
}
