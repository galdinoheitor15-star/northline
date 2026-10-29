import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Check, Flame, Plus, Repeat, Undo2 } from 'lucide-react-native';
import { HabitIcon } from '@/components/HabitIcon';
import { IconButton } from '@/components/ui/Button';
import { Card, Chip, EmptyState, ProgressBar, Row, Stat } from '@/components/ui/primitives';
import { Header, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { completionRate, computeStreak, habitsTodaySummary, isScheduledOn, logsByDate } from '@/domain/habits';
import { addDaysKey, startOfWeekKey, WEEKDAYS_LETTER, weekdayOfKey } from '@/domain/time';
import type { Habit } from '@/domain/types';
import { useNow } from '@/hooks/useNow';
import { checkHabit, uncheckHabit } from '@/state/actions';
import { useData } from '@/state/data';
import { colors, radius, space } from '@/theme/tokens';

export default function Habits() {
  const { today } = useNow();
  const habits = useData((s) => s.habits);
  const logs = useData((s) => s.habitLogs);
  const weekStartsOn = useData((s) => s.profile.weekStartsOn);
  const [showArchived, setShowArchived] = useState(false);
  const active = habits.filter((h) => (showArchived ? !!h.archivedAt : !h.archivedAt));
  const summary = habitsTodaySummary(habits, logs, today);
  const weekStart = startOfWeekKey(today, weekStartsOn);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDaysKey(weekStart, i));

  const weekRate = useMemo(() => {
    const rates = habits.filter((h) => !h.archivedAt).map((h) => completionRate(h, logs, weekStart, addDaysKey(weekStart, 6), today));
    const sched = rates.reduce((a, r) => a + r.scheduled, 0);
    return sched ? rates.reduce((a, r) => a + Math.min(r.done, r.scheduled), 0) / sched : 0;
  }, [habits, logs, weekStart, today]);

  return (
    <Screen tabBarSpace header={<Header title="Hábitos" large right={<IconButton icon={Plus} label="Novo hábito" tone="filled" onPress={() => router.push('/habit-form')} />} />}>
      <Card>
        <Row>
          <Stat label="Hoje" value={`${summary.done}/${summary.scheduled}`} />
          <Stat label="Semana" value={`${Math.round(weekRate * 100)}%`} />
          <Stat label="Ativos" value={String(habits.filter((h) => !h.archivedAt).length)} />
        </Row>
        <View style={{ marginTop: space.md }}>
          <ProgressBar value={summary.progress} tone={summary.progress >= 1 && summary.scheduled > 0 ? 'positive' : 'silver'} />
        </View>
      </Card>

      <Row gap={space.sm}>
        <Chip label="Ativos" selected={!showArchived} onPress={() => setShowArchived(false)} />
        <Chip label="Arquivados" selected={showArchived} onPress={() => setShowArchived(true)} />
      </Row>

      {active.length === 0 ? (
        <Card>
          <EmptyState icon={Repeat} title={showArchived ? 'Nenhum hábito arquivado' : 'Comece um hábito'} description={showArchived ? undefined : 'Leitura, água, sono, estudos… Defina os dias e acompanhe a consistência.'} action={showArchived ? undefined : 'Criar hábito'} onAction={() => router.push('/habit-form')} />
        </Card>
      ) : (
        active.map((h) => <HabitCard key={h.id} habit={h} today={today} weekDays={weekDays} />)
      )}
    </Screen>
  );
}

function HabitCard({ habit: h, today, weekDays }: { habit: Habit; today: string; weekDays: string[] }) {
  const logs = useData((s) => s.habitLogs);
  const weekStartsOn = useData((s) => s.profile.weekStartsOn);
  const map = logsByDate(logs, h.id);
  const count = map.get(today) ?? 0;
  const target = Math.max(1, h.dailyTarget);
  const scheduledToday = isScheduledOn(h, today);
  const done = count >= target;
  const streak = computeStreak(h, logs, today, weekStartsOn);
  const weekDone = h.frequency === 'weekly' ? weekDays.filter((d) => d <= today && (map.get(d) ?? 0) >= target).length : 0;

  return (
    <Card onPress={() => router.push(`/habit/${h.id}`)} accessibilityLabel={h.name}>
      <Row>
        <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' }}>
          <HabitIcon name={h.icon} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyMedium" numberOfLines={1}>
            {h.name}
          </Text>
          <Row gap={space.sm}>
            <Flame size={13} color={streak.current > 0 ? colors.silver : colors.textFaint} />
            <Text variant="small" tone="muted">
              {streak.current} {streak.unit}
              {h.frequency === 'weekly' ? ` · ${weekDone}/${h.weeklyTarget} nesta semana` : target > 1 ? ` · ${count}/${target} hoje` : ''}
              {!scheduledToday && h.frequency === 'daily' ? ' · não programado hoje' : ''}
            </Text>
          </Row>
        </View>
        {!h.archivedAt && (scheduledToday || h.frequency === 'weekly') && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
            {count > 0 && <IconButton icon={Undo2} label={`Desfazer ${h.name}`} size={36} tone="muted" onPress={() => void uncheckHabit(h, today)} />}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={done ? `${h.name} concluído hoje` : `Marcar ${h.name}`}
              accessibilityState={{ checked: done }}
              disabled={done}
              onPress={() => void checkHabit(h, today)}
              style={({ pressed }) => ({ width: 44, height: 44, borderRadius: radius.pill, borderWidth: 1.5, borderColor: done ? colors.positive : colors.borderStrong, backgroundColor: done ? colors.positive : pressed ? colors.surface3 : 'transparent', alignItems: 'center', justifyContent: 'center' })}
            >
              {done ? <Check size={20} color={colors.onSilver} strokeWidth={2.6} /> : target > 1 ? <Text variant="smallMedium">{count}</Text> : <Check size={18} color={colors.textFaint} />}
            </Pressable>
          </View>
        )}
      </Row>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space.md }}>
        {weekDays.map((d) => {
          const c = map.get(d) ?? 0;
          const sched = isScheduledOn(h, d);
          const full = c >= target;
          const future = d > today;
          return (
            <View key={d} style={{ alignItems: 'center', gap: 4, flex: 1 }}>
              <Text variant="small" tone={d === today ? 'default' : 'faint'} style={{ fontSize: 11 }}>
                {WEEKDAYS_LETTER[weekdayOfKey(d)]}
              </Text>
              <View
                accessibilityLabel={`${d}: ${full ? 'feito' : future ? 'futuro' : sched ? 'não feito' : 'não programado'}`}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  backgroundColor: full ? colors.positive : c > 0 ? colors.positiveDim : 'transparent',
                  borderWidth: full ? 0 : 1,
                  borderColor: !sched && h.frequency === 'daily' ? 'transparent' : future ? colors.border : colors.borderStrong,
                  borderStyle: future ? 'dashed' : 'solid',
                }}
              />
            </View>
          );
        })}
      </View>
    </Card>
  );
}
