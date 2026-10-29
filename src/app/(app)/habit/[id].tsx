import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Archive, ArchiveRestore, Pencil, Trash2 } from 'lucide-react-native';
import { HabitIcon } from '@/components/HabitIcon';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, Row, SectionHeader, Stat } from '@/components/ui/primitives';
import { confirm, toast } from '@/components/ui/Overlay';
import { Header, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { completionRate, computeStreak, heatmap, logsByDate } from '@/domain/habits';
import { describeRecurrence } from '@/domain/recurrence';
import { addDaysKey, formatShortDate, startOfMonthKey, startOfWeekKey, WEEKDAYS_LETTER } from '@/domain/time';
import { useNow } from '@/hooks/useNow';
import { nowIso } from '@/lib/id';
import { checkHabit, uncheckHabit } from '@/state/actions';
import { useData } from '@/state/data';
import { colors, radius, space } from '@/theme/tokens';

const CELL = { done: colors.positive, partial: 'rgba(79,178,134,0.45)', missed: colors.surface3, off: 'transparent', future: 'transparent' } as const;

export default function HabitDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { today } = useNow();
  const habit = useData((s) => s.habits.find((h) => h.id === id));
  const logs = useData((s) => s.habitLogs);
  const weekStartsOn = useData((s) => s.profile.weekStartsOn);
  const [selected, setSelected] = useState<string | null>(null);

  const weeks = 15;
  const gridStart = startOfWeekKey(addDaysKey(today, -(weeks - 1) * 7), weekStartsOn);
  const cells = useMemo(() => (habit ? heatmap(habit, logs, gridStart, addDaysKey(gridStart, weeks * 7 - 1), today) : []), [habit, logs, gridStart, today]);

  if (!habit) {
    return (
      <Screen header={<Header title="Hábito" back />}>
        <Text tone="muted">Este hábito não existe mais.</Text>
      </Screen>
    );
  }
  const streak = computeStreak(habit, logs, today, weekStartsOn);
  const week = completionRate(habit, logs, startOfWeekKey(today, weekStartsOn), addDaysKey(startOfWeekKey(today, weekStartsOn), 6), today);
  const month = completionRate(habit, logs, startOfMonthKey(today), today, today);
  const total = [...logsByDate(logs, habit.id).values()].filter((c) => c >= Math.max(1, habit.dailyTarget)).length;
  const map = logsByDate(logs, habit.id);
  const sel = selected ?? today;
  const selCount = map.get(sel) ?? 0;

  const archive = async () => {
    await useData.getState().save('habits', { ...habit, archivedAt: habit.archivedAt ? null : nowIso(), updatedAt: nowIso() });
    toast.show(habit.archivedAt ? 'Hábito reativado.' : 'Hábito arquivado. O histórico foi mantido.');
  };
  const remove = async () => {
    if (!(await confirm({ title: 'Excluir hábito?', message: 'O hábito e todo o histórico serão apagados. Prefira arquivar para manter as estatísticas.', destructive: true, confirmLabel: 'Excluir' }))) return;
    const ids = logs.filter((l) => l.habitId === habit.id).map((l) => l.id);
    if (await useData.getState().remove('habits', habit.id)) {
      // no Supabase os registros saem em cascata; no modo local removemos explicitamente
      if (ids.length) await useData.getState().remove('habitLogs', ids);
      router.back();
    }
  };

  return (
    <Screen
      header={
        <Header
          title={habit.name}
          back
          right={
            <>
              <IconButton icon={Pencil} label="Editar hábito" onPress={() => router.push(`/habit-form?id=${habit.id}`)} />
              <IconButton icon={Trash2} label="Excluir hábito" onPress={remove} />
            </>
          }
        />
      }
    >
      <Card>
        <Row>
          <View style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' }}>
            <HabitIcon name={habit.icon} size={20} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="small" tone="muted">
              {habit.frequency === 'weekly' ? `${habit.weeklyTarget}× por semana` : describeRecurrence({ freq: 'weekly', interval: 1, byWeekday: habit.weekdays })}
              {habit.dailyTarget > 1 ? ` · meta de ${habit.dailyTarget} por dia` : ''}
              {habit.time ? ` · ${habit.time}` : ''}
            </Text>
            {habit.description && <Text variant="small">{habit.description}</Text>}
          </View>
        </Row>
      </Card>

      <Card>
        <Row style={{ flexWrap: 'wrap', rowGap: space.md }}>
          <Stat label="Sequência atual" value={`${streak.current} ${streak.unit}`} />
          <Stat label="Melhor sequência" value={`${streak.best} ${streak.unit}`} />
        </Row>
        <Row style={{ marginTop: space.md }}>
          <Stat label="Semana" value={`${Math.round(week.rate * 100)}%`} hint={`${week.done}/${week.scheduled}`} />
          <Stat label="Mês" value={`${Math.round(month.rate * 100)}%`} hint={`${month.done}/${month.scheduled}`} />
          <Stat label="Dias concluídos" value={String(total)} />
        </Row>
      </Card>

      <Card>
        <SectionHeader title="Calendário de consistência" />
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <View style={{ gap: 4, marginRight: 2 }}>
            {Array.from({ length: 7 }, (_, i) => (
              <Text key={i} variant="small" tone="faint" style={{ height: 16, fontSize: 10, lineHeight: 16 }}>
                {WEEKDAYS_LETTER[(i + weekStartsOn) % 7]}
              </Text>
            ))}
          </View>
          {Array.from({ length: weeks }, (_, w) => (
            <View key={w} style={{ gap: 4, flex: 1, maxWidth: 18 }}>
              {cells.slice(w * 7, w * 7 + 7).map((c) => (
                <Pressable
                  key={c.key}
                  accessibilityRole="button"
                  accessibilityLabel={`${formatShortDate(c.key)}: ${c.state}`}
                  onPress={() => c.key <= today && setSelected(c.key)}
                  style={{ height: 16, borderRadius: 4, backgroundColor: CELL[c.state], borderWidth: c.state === 'future' || c.state === 'off' ? 1 : 0, borderColor: colors.border, outlineColor: colors.silver, outlineWidth: sel === c.key ? 1.5 : 0, outlineStyle: 'solid' } as object}
                />
              ))}
            </View>
          ))}
        </View>
        <Text variant="small" tone="faint" style={{ marginTop: space.sm }}>
          Dias futuros e dias não programados não contam como falha.
        </Text>
      </Card>

      {!habit.archivedAt && (
        <Card>
          <Text variant="bodyMedium">{sel === today ? 'Hoje' : formatShortDate(sel)}</Text>
          <Text variant="small" tone="muted" style={{ marginBottom: space.md }}>
            {selCount}/{Math.max(1, habit.dailyTarget)} registrado
          </Text>
          <Row>
            <Button label="Registrar" size="sm" onPress={() => void checkHabit(habit, sel)} disabled={selCount >= Math.max(1, habit.dailyTarget)} style={{ flex: 1 }} />
            <Button label="Desfazer" size="sm" variant="secondary" onPress={() => void uncheckHabit(habit, sel)} disabled={selCount === 0} style={{ flex: 1 }} />
          </Row>
        </Card>
      )}

      <Button label={habit.archivedAt ? 'Reativar hábito' : 'Arquivar hábito'} icon={habit.archivedAt ? ArchiveRestore : Archive} variant="secondary" onPress={archive} />
    </Screen>
  );
}
