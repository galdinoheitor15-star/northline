import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowDown, ArrowUp, CalendarPlus, Plus, Trash2, X } from 'lucide-react-native';
import { WeekdayPicker } from '@/components/pickers';
import { Button, IconButton } from '@/components/ui/Button';
import { Field, TextField, TimeField } from '@/components/ui/Input';
import { Card, Chip, ChipRow, Row } from '@/components/ui/primitives';
import { confirm, toast } from '@/components/ui/Overlay';
import { Header, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { addDaysKey, weekdayOfKey } from '@/domain/time';
import type { RoutineExercise, WorkoutRoutine } from '@/domain/types';
import { MUSCLE_GROUPS } from '@/domain/workouts';
import { useNow } from '@/hooks/useNow';
import { newId, nowIso } from '@/lib/id';
import { createEvent } from '@/state/actions';
import { useData } from '@/state/data';
import { colors, space } from '@/theme/tokens';

const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

export default function RoutineForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { today, tz } = useNow();
  const existing = useData((s) => s.routines.find((r) => r.id === id));
  const events = useData((s) => s.events);
  const [r, setR] = useState<WorkoutRoutine>(() => existing ?? { id: newId(), name: '', notes: null, muscleGroups: [], scheduleWeekdays: [], scheduleTime: null, exercises: [], createdAt: nowIso(), updatedAt: nowIso() });
  const [error, setError] = useState<string>();
  const patch = (p: Partial<WorkoutRoutine>) => setR((x) => ({ ...x, ...p }));
  const patchEx = (exId: string, p: Partial<RoutineExercise>) => patch({ exercises: r.exercises.map((e) => (e.id === exId ? { ...e, ...p } : e)) });
  const move = (i: number, d: number) => {
    const list = [...r.exercises];
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    patch({ exercises: list.map((e, k) => ({ ...e, position: k })) });
  };
  const scheduledOnAgenda = existing && events.some((e) => e.source === 'workout' && e.title === `Treino: ${existing.name}` && e.recurrence);

  const save = async () => {
    if (!r.name.trim()) return setError('Dê um nome à rotina.');
    const bad = r.exercises.find((e) => !e.name.trim() || e.sets < 1 || e.reps < 0 || (e.weightKg != null && (isNaN(e.weightKg) || e.weightKg < 0)));
    if (bad) return setError('Revise os exercícios: nome, séries e carga válidos.');
    const groups = [...new Set(r.exercises.map((e) => e.muscleGroup).filter(Boolean))];
    if (await useData.getState().save('routines', { ...r, name: r.name.trim(), muscleGroups: groups, updatedAt: nowIso() })) {
      toast.success('Rotina salva.');
      router.back();
    }
  };

  const addToAgenda = async () => {
    if (!r.scheduleWeekdays.length || !r.scheduleTime) return toast.error('Defina os dias e o horário antes.');
    let start = today;
    while (!r.scheduleWeekdays.includes(weekdayOfKey(start))) start = addDaysKey(start, 1);
    try {
      const ev = await createEvent({ title: `Treino: ${r.name.trim()}`, date: start, startTime: r.scheduleTime, durationMinutes: 60, timezone: tz, category: 'health', reminderMinutes: 30, recurrence: { freq: 'weekly', interval: 1, byWeekday: r.scheduleWeekdays } }, { source: 'workout' });
      if (ev) toast.success('Treinos programados na agenda.');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const remove = async () => {
    if (!existing) return;
    if (!(await confirm({ title: 'Excluir rotina?', message: 'Os treinos já registrados continuam no histórico.', destructive: true, confirmLabel: 'Excluir' }))) return;
    if (await useData.getState().remove('routines', existing.id)) router.back();
  };

  return (
    <Screen header={<Header title={existing ? 'Editar rotina' : 'Nova rotina'} back right={existing ? <IconButton icon={Trash2} label="Excluir rotina" onPress={remove} /> : undefined} />} footer={<Button label="Salvar rotina" onPress={save} />}>
      <TextField label="Nome" value={r.name} onChangeText={(name) => patch({ name })} placeholder="Ex.: Treino A — Peito e tríceps" error={error} maxLength={80} />
      <TextField label="Observações" value={r.notes ?? ''} onChangeText={(n) => patch({ notes: n || null })} multiline placeholder="Opcional" />

      <Text variant="caption" tone="muted">
        Exercícios
      </Text>
      {r.exercises.map((e, i) => (
        <Card key={e.id}>
          <View style={{ gap: space.sm }}>
            <Row>
              <View style={{ flex: 1 }}>
                <TextField value={e.name} onChangeText={(name) => patchEx(e.id, { name })} placeholder="Nome do exercício" />
              </View>
              <IconButton icon={ArrowUp} label="Mover para cima" size={34} onPress={() => move(i, -1)} />
              <IconButton icon={ArrowDown} label="Mover para baixo" size={34} onPress={() => move(i, 1)} />
              <IconButton icon={X} label="Remover exercício" size={34} onPress={() => patch({ exercises: r.exercises.filter((x) => x.id !== e.id).map((x, k) => ({ ...x, position: k })) })} />
            </Row>
            <ChipRow>
              {MUSCLE_GROUPS.map((g) => (
                <Chip key={g} label={g} selected={e.muscleGroup === g} onPress={() => patchEx(e.id, { muscleGroup: g })} />
              ))}
            </ChipRow>
            <Row>
              <View style={{ flex: 1 }}>
                <TextField label="Séries" value={String(e.sets)} keyboardType="number-pad" onChangeText={(s) => patchEx(e.id, { sets: Math.max(1, Math.min(50, Number(s.replace(/\D/g, '')) || 1)) })} />
              </View>
              <View style={{ flex: 1 }}>
                <TextField label="Reps" value={String(e.reps)} keyboardType="number-pad" onChangeText={(s) => patchEx(e.id, { reps: Math.min(1000, Number(s.replace(/\D/g, '')) || 0) })} />
              </View>
              <View style={{ flex: 1 }}>
                <TextField label="Carga (kg)" value={e.weightKg == null ? '' : String(e.weightKg)} keyboardType="decimal-pad" onChangeText={(s) => patchEx(e.id, { weightKg: num(s) })} />
              </View>
              <View style={{ flex: 1 }}>
                <TextField label="Descanso (s)" value={e.restSeconds == null ? '' : String(e.restSeconds)} keyboardType="number-pad" onChangeText={(s) => patchEx(e.id, { restSeconds: num(s) })} />
              </View>
            </Row>
            <TextField value={e.notes ?? ''} onChangeText={(n) => patchEx(e.id, { notes: n || null })} placeholder="Observações do exercício" />
          </View>
        </Card>
      ))}
      <Pressable
        accessibilityRole="button"
        onPress={() => patch({ exercises: [...r.exercises, { id: newId(), name: '', muscleGroup: r.exercises.at(-1)?.muscleGroup ?? '', sets: 3, reps: 10, weightKg: null, restSeconds: 60, notes: null, position: r.exercises.length }] })}
        style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center', justifyContent: 'center', height: 46, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong }}
      >
        <Plus size={16} color={colors.textMuted} />
        <Text variant="smallMedium" tone="muted">
          Adicionar exercício
        </Text>
      </Pressable>

      <Field label="Programação semanal">
        <WeekdayPicker value={r.scheduleWeekdays} onChange={(scheduleWeekdays) => patch({ scheduleWeekdays })} />
      </Field>
      <TimeField label="Horário" value={r.scheduleTime} onChange={(scheduleTime) => patch({ scheduleTime })} allowEmpty presets={['06:00', '07:00', '12:00', '18:30']} />
      {existing && (
        <Button label={scheduledOnAgenda ? 'Já programado na agenda' : 'Programar na agenda'} icon={CalendarPlus} variant="secondary" disabled={!!scheduledOnAgenda} onPress={addToAgenda} />
      )}
    </Screen>
  );
}
