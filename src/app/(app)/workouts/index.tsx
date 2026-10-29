import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Copy, Dumbbell, History, Plus, TrendingUp } from 'lucide-react-native';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, Chip, ChipRow, EmptyState, Row, SectionHeader, Segmented, Stat } from '@/components/ui/primitives';
import { Header, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { formatShortDate, relativeDayLabel, toDateKey, WEEKDAYS_SHORT } from '@/domain/time';
import { exerciseProgress, lastSession, nextScheduledWorkout, sessionVolumeKg } from '@/domain/workouts';
import { useNow } from '@/hooks/useNow';
import { useData } from '@/state/data';
import { colors, radius, space } from '@/theme/tokens';

export default function Workouts() {
  const { now, today, tz } = useNow();
  const routines = useData((s) => s.routines);
  const sessions = useData((s) => s.sessions);
  const [tab, setTab] = useState<'routines' | 'history' | 'progress'>('routines');
  const next = nextScheduledWorkout(routines, sessions, now, tz);
  const last = lastSession(sessions);
  const history = useMemo(() => [...sessions].filter((s) => s.endedAt).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)), [sessions]);
  const inProgress = sessions.find((s) => !s.endedAt);
  const exerciseNames = useMemo(() => [...new Set(sessions.flatMap((s) => s.sets.filter((x) => x.done).map((x) => x.exerciseName)))].sort(), [sessions]);
  const [exercise, setExercise] = useState<string | null>(null);
  const ex = exercise ?? exerciseNames[0] ?? null;
  const progress = ex ? exerciseProgress(sessions, ex) : [];
  const maxW = Math.max(1, ...progress.map((p) => p.maxWeightKg));
  const thisWeek = history.filter((s) => toDateKey(new Date(s.startedAt), tz) >= toDateKey(new Date(now.getTime() - 6 * 86_400_000), tz)).length;

  return (
    <Screen header={<Header title="Treinos" back right={<IconButton icon={Plus} label="Nova rotina" tone="filled" onPress={() => router.push('/workouts/routine')} />} />}>
      {inProgress && (
        <Card style={{ borderColor: colors.silverDim }} onPress={() => router.push(`/workouts/session?id=${inProgress.id}`)} accessibilityLabel="Continuar treino em andamento">
          <Text variant="caption" tone="silver">
            Em andamento
          </Text>
          <Text variant="bodyMedium">{inProgress.name}</Text>
          <Text variant="small" tone="muted">
            Toque para continuar o registro
          </Text>
        </Card>
      )}
      <Card>
        <Row>
          <Stat label="Próximo" value={next ? next.routine.name.split('—')[0].trim() : '—'} hint={next ? `${relativeDayLabel(next.date, today)}${next.time ? ` · ${next.time}` : ''}` : 'Nada programado'} />
          <Stat label="Últimos 7 dias" value={`${thisWeek} treino${thisWeek === 1 ? '' : 's'}`} hint={last ? `Último: ${relativeDayLabel(toDateKey(new Date(last.startedAt), tz), today)}` : undefined} />
        </Row>
        <Row style={{ marginTop: space.md }}>
          <Button label="Registrar treino" icon={Dumbbell} style={{ flex: 1 }} onPress={() => router.push(next ? `/workouts/session?routineId=${next.routine.id}` : '/workouts/session')} />
          {last && <Button label="Repetir último" icon={Copy} variant="secondary" style={{ flex: 1 }} onPress={() => router.push(`/workouts/session?copy=${last.id}`)} />}
        </Row>
      </Card>

      <Segmented
        options={[
          { value: 'routines', label: 'Rotinas' },
          { value: 'history', label: 'Histórico' },
          { value: 'progress', label: 'Evolução' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'routines' &&
        (routines.length === 0 ? (
          <Card>
            <EmptyState icon={Dumbbell} title="Nenhuma rotina" description="Monte seu treino A/B/C com exercícios, séries, repetições e cargas." action="Criar rotina" onAction={() => router.push('/workouts/routine')} />
          </Card>
        ) : (
          routines.map((r) => (
            <Card key={r.id} onPress={() => router.push(`/workouts/routine?id=${r.id}`)} accessibilityLabel={r.name}>
              <Row style={{ alignItems: 'flex-start' }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyMedium">{r.name}</Text>
                  <Text variant="small" tone="muted">
                    {r.exercises.length} exercício{r.exercises.length === 1 ? '' : 's'}
                    {r.muscleGroups.length ? ` · ${r.muscleGroups.join(', ')}` : ''}
                  </Text>
                  <Text variant="small" tone="faint">
                    {r.scheduleWeekdays.length ? `${r.scheduleWeekdays.map((d) => WEEKDAYS_SHORT[d]).join(', ')}${r.scheduleTime ? ` · ${r.scheduleTime}` : ''}` : 'Sem programação'}
                  </Text>
                </View>
                <Button label="Iniciar" size="sm" onPress={() => router.push(`/workouts/session?routineId=${r.id}`)} />
              </Row>
            </Card>
          ))
        ))}

      {tab === 'history' && (
        <Card>
          {history.length === 0 ? (
            <EmptyState icon={History} title="Nenhum treino registrado" />
          ) : (
            history.map((s) => (
              <View key={s.id} style={{ paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Row>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyMedium" onPress={() => router.push(`/workouts/session?id=${s.id}`)}>
                      {s.name}
                    </Text>
                    <Text variant="small" tone="muted">
                      {relativeDayLabel(toDateKey(new Date(s.startedAt), tz), today)} · {s.durationMinutes ?? '?'} min · {s.sets.filter((x) => x.done).length} séries · {Math.round(sessionVolumeKg(s))} kg de volume
                    </Text>
                  </View>
                  <IconButton icon={Copy} label="Copiar este treino" size={34} onPress={() => router.push(`/workouts/session?copy=${s.id}`)} />
                </Row>
              </View>
            ))
          )}
        </Card>
      )}

      {tab === 'progress' && (
        <Card>
          <SectionHeader title="Carga máxima por sessão" icon={TrendingUp} />
          {exerciseNames.length === 0 ? (
            <EmptyState icon={TrendingUp} title="Sem dados ainda" description="Registre treinos para ver a evolução de cada exercício." />
          ) : (
            <View style={{ gap: space.md }}>
              <ChipRow>
                {exerciseNames.map((n) => (
                  <Chip key={n} label={n} selected={ex === n} onPress={() => setExercise(n)} />
                ))}
              </ChipRow>
              <View accessibilityLabel={`Evolução de ${ex}`} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 140, paddingTop: space.md }}>
                {progress.slice(-12).map((p) => (
                  <View key={p.date} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                    <Text variant="small" tone="muted" style={{ fontSize: 10 }}>
                      {p.maxWeightKg}
                    </Text>
                    <View style={{ width: '100%', maxWidth: 28, height: Math.max(4, (p.maxWeightKg / maxW) * 100), backgroundColor: colors.silverDim, borderRadius: radius.sm / 2 }} />
                    <Text variant="small" tone="faint" style={{ fontSize: 10 }}>
                      {formatShortDate(toDateKey(new Date(p.date), tz))}
                    </Text>
                  </View>
                ))}
              </View>
              <Text variant="small" tone="faint">
                Valores em kg, registrados por você. O Northline não faz recomendações de treino.
              </Text>
            </View>
          )}
        </Card>
      )}
    </Screen>
  );
}
