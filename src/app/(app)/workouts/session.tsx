import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Plus, Trash2, X } from 'lucide-react-native';
import { Checkbox } from '@/components/rows';
import { Button, IconButton } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Input';
import { Card, Chip, ChipRow, Row } from '@/components/ui/primitives';
import { confirm, toast } from '@/components/ui/Overlay';
import { Header, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { formatShortDate, toDateKey } from '@/domain/time';
import type { SessionSet, WorkoutSession } from '@/domain/types';
import { copySessionSets, groupSets, lastPerformance, MUSCLE_GROUPS, setsFromRoutine } from '@/domain/workouts';
import { useNow } from '@/hooks/useNow';
import { newId, nowIso } from '@/lib/id';
import { useData } from '@/state/data';
import { colors, space } from '@/theme/tokens';

// posições ficam inteiras no banco: reordena após inserir no meio
const renumber = (sets: SessionSet[]) => [...sets].sort((a, b) => a.position - b.position).map((x, i) => ({ ...x, position: i }));

export default function SessionLog() {
  const params = useLocalSearchParams<{ id?: string; routineId?: string; copy?: string }>();
  const { tz } = useNow();
  const sessions = useData((s) => s.sessions);
  const routines = useData((s) => s.routines);
  const existing = sessions.find((s) => s.id === params.id);

  const [s, setS] = useState<WorkoutSession>(() => {
    if (existing) return existing;
    const ts = nowIso();
    const routine = routines.find((r) => r.id === params.routineId);
    const copyFrom = sessions.find((x) => x.id === params.copy);
    return {
      id: newId(),
      routineId: routine?.id ?? copyFrom?.routineId ?? null,
      name: routine?.name ?? copyFrom?.name ?? 'Treino livre',
      startedAt: ts,
      endedAt: null,
      durationMinutes: null,
      notes: null,
      sets: routine ? setsFromRoutine(routine, sessions, newId) : copyFrom ? copySessionSets(copyFrom, newId) : [],
      createdAt: ts,
      updatedAt: ts,
    };
  });
  const [newExercise, setNewExercise] = useState('');
  const [group, setGroup] = useState('');
  const [durationText, setDurationText] = useState(existing?.durationMinutes ? String(existing.durationMinutes) : '');
  const finished = !!s.endedAt;
  const groups = useMemo(() => groupSets(s.sets), [s.sets]);
  const patchSet = (id: string, p: Partial<SessionSet>) => setS((x) => ({ ...x, sets: x.sets.map((st) => (st.id === id ? { ...st, ...p } : st)) }));

  // salva o rascunho do treino em andamento para não perder ao sair da tela
  useEffect(() => {
    if (finished || !s.sets.length) return;
    const t = setTimeout(() => void useData.getState().save('sessions', { ...s, updatedAt: nowIso() }), 800);
    return () => clearTimeout(t);
  }, [s, finished]);

  const addExercise = () => {
    const name = newExercise.trim();
    if (!name) return;
    const pos = (s.sets.at(-1)?.position ?? -1) + 1;
    const last = lastPerformance(sessions, name);
    setS((x) => ({ ...x, sets: [...x.sets, ...Array.from({ length: 3 }, (_, i) => ({ id: newId(), exerciseName: name, muscleGroup: group, setIndex: i + 1, reps: last?.reps ?? 10, weightKg: last?.weightKg ?? null, done: false, position: pos + i }))] }));
    setNewExercise('');
  };

  const finish = async () => {
    if (!s.sets.some((x) => x.done)) return toast.error('Marque pelo menos uma série como feita.');
    const end = new Date();
    const auto = Math.round((end.getTime() - new Date(s.startedAt).getTime()) / 60_000);
    const minutes = durationText ? Math.max(0, Math.min(1440, Number(durationText) || 0)) : Math.min(auto, 600);
    if (await useData.getState().save('sessions', { ...s, endedAt: end.toISOString(), durationMinutes: minutes, updatedAt: nowIso() })) {
      toast.success('Treino registrado.');
      router.back();
    }
  };

  const saveEdits = async () => {
    if (await useData.getState().save('sessions', { ...s, durationMinutes: durationText ? Number(durationText) : s.durationMinutes, updatedAt: nowIso() })) {
      toast.success('Treino atualizado.');
      router.back();
    }
  };

  const discard = async () => {
    if (!(await confirm({ title: finished ? 'Excluir este treino?' : 'Descartar treino?', message: 'Os dados desta sessão serão apagados.', destructive: true, confirmLabel: finished ? 'Excluir' : 'Descartar' }))) return;
    if (sessions.some((x) => x.id === s.id)) await useData.getState().remove('sessions', s.id);
    router.back();
  };

  return (
    <Screen
      header={<Header title={finished ? 'Treino registrado' : 'Registrar treino'} subtitle={formatShortDate(toDateKey(new Date(s.startedAt), tz))} back right={<IconButton icon={Trash2} label={finished ? 'Excluir treino' : 'Descartar treino'} onPress={discard} />} />}
      footer={<Button label={finished ? 'Salvar alterações' : 'Concluir treino'} onPress={finished ? saveEdits : finish} />}
    >
      <TextField label="Nome do treino" value={s.name} onChangeText={(name) => setS((x) => ({ ...x, name }))} maxLength={80} />
      {!finished && routines.length > 0 && s.sets.length === 0 && (
        <View style={{ gap: space.sm }}>
          <Text variant="small" tone="muted">
            Começar a partir de uma rotina:
          </Text>
          <ChipRow>
            {routines.map((r) => (
              <Chip key={r.id} label={r.name} onPress={() => setS((x) => ({ ...x, routineId: r.id, name: r.name, sets: setsFromRoutine(r, sessions, newId) }))} />
            ))}
          </ChipRow>
        </View>
      )}

      {groups.map((g) => {
        const last = lastPerformance(sessions, g.exerciseName, s.id);
        return (
          <Card key={g.exerciseName}>
            <Row style={{ marginBottom: space.sm }}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyMedium">{g.exerciseName}</Text>
                <Text variant="small" tone="muted">
                  {g.muscleGroup || 'Sem grupo'}
                  {last ? ` · último: ${last.sets}× ${last.reps} reps${last.weightKg != null ? ` com ${last.weightKg} kg` : ''}` : ' · primeira vez'}
                </Text>
              </View>
            </Row>
            <Row style={{ paddingVertical: 4 }}>
              <Text variant="small" tone="faint" style={{ width: 34 }}>
                Série
              </Text>
              <Text variant="small" tone="faint" style={{ flex: 1 }}>
                Reps
              </Text>
              <Text variant="small" tone="faint" style={{ flex: 1 }}>
                Carga (kg)
              </Text>
              <View style={{ width: 62 }} />
            </Row>
            {g.sets.map((st) => (
              <Row key={st.id} style={{ paddingVertical: 4 }}>
                <Text variant="smallMedium" style={{ width: 34 }}>
                  {st.setIndex}
                </Text>
                <View style={{ flex: 1 }}>
                  <TextField value={String(st.reps)} keyboardType="number-pad" onChangeText={(v) => patchSet(st.id, { reps: Math.min(1000, Number(v.replace(/\D/g, '')) || 0) })} accessibilityLabel={`Repetições da série ${st.setIndex}`} />
                </View>
                <View style={{ flex: 1 }}>
                  <TextField value={st.weightKg == null ? '' : String(st.weightKg)} keyboardType="decimal-pad" onChangeText={(v) => patchSet(st.id, { weightKg: v.trim() === '' ? null : Number(v.replace(',', '.')) || 0 })} accessibilityLabel={`Carga da série ${st.setIndex}`} />
                </View>
                <Checkbox checked={st.done} label={`Série ${st.setIndex} feita`} onPress={() => patchSet(st.id, { done: !st.done })} />
                <Pressable accessibilityRole="button" accessibilityLabel={`Remover série ${st.setIndex}`} hitSlop={8} onPress={() => setS((x) => ({ ...x, sets: x.sets.filter((y) => y.id !== st.id) }))}>
                  <X size={16} color={colors.textFaint} />
                </Pressable>
              </Row>
            ))}
            <Button
              label="Adicionar série"
              size="sm"
              variant="ghost"
              icon={Plus}
              onPress={() => {
                const lastSet = g.sets.at(-1)!;
                setS((x) => ({ ...x, sets: renumber([...x.sets, { ...lastSet, id: newId(), setIndex: lastSet.setIndex + 1, done: false, position: lastSet.position + 0.5 }]) }));
              }}
            />
          </Card>
        );
      })}

      <Card>
        <Text variant="smallMedium" style={{ marginBottom: space.sm }}>
          Adicionar exercício
        </Text>
        <View style={{ gap: space.sm }}>
          <TextField value={newExercise} onChangeText={setNewExercise} placeholder="Ex.: Agachamento livre" onSubmitEditing={addExercise} />
          <ChipRow>
            {MUSCLE_GROUPS.map((m) => (
              <Chip key={m} label={m} selected={group === m} onPress={() => setGroup(m)} />
            ))}
          </ChipRow>
          <Button label="Adicionar" size="sm" variant="secondary" onPress={addExercise} disabled={!newExercise.trim()} />
        </View>
      </Card>

      <TextField label="Duração (min)" value={durationText} onChangeText={(v) => setDurationText(v.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" hint={finished ? undefined : 'Em branco: calculada pelo horário de início.'} />
      <TextField label="Observações" value={s.notes ?? ''} onChangeText={(notes) => setS((x) => ({ ...x, notes: notes || null }))} multiline placeholder="Como foi o treino?" />
    </Screen>
  );
}
