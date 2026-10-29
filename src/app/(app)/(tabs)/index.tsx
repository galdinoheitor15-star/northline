import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Bell, CalendarDays, CalendarPlus, Dumbbell, ListTodo, Plus, Repeat, Settings, Wallet } from 'lucide-react-native';
import { AssistantCard } from '@/components/AssistantCard';
import { LogoMark } from '@/components/brand/Logo';
import { EventRow } from '@/components/rows';
import { IconButton } from '@/components/ui/Button';
import { Card, EmptyState, ProgressBar, ProgressRing, Row, SectionHeader, Stat } from '@/components/ui/primitives';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { formatBRL, goalProgress, monthRange, periodTotals, totalBalance } from '@/domain/finance';
import { computeStreak, habitsTodaySummary } from '@/domain/habits';
import { expandEvents } from '@/domain/recurrence';
import { daySummary } from '@/domain/tasks';
import { endOfDayUtc, capitalize, formatLongDate, greeting, relativeDayLabel, startOfDayUtc, toDateKey } from '@/domain/time';
import { lastSession, nextScheduledWorkout } from '@/domain/workouts';
import { useNow } from '@/hooks/useNow';
import { useData } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, radius, space } from '@/theme/tokens';

export default function Dashboard() {
  const { now, tz, today } = useNow();
  const d = useData();
  const mode = useSession((s) => s.mode);
  const firstName = d.profile.displayName.split(' ')[0];

  const todayEvents = useMemo(() => expandEvents(d.events, startOfDayUtc(today, tz), endOfDayUtc(today, tz)), [d.events, today, tz]);
  const tasks = useMemo(() => daySummary(d.tasks, today, (t) => (t.completedAt ? toDateKey(new Date(t.completedAt), tz) : null)), [d.tasks, today, tz]);
  const habits = useMemo(() => habitsTodaySummary(d.habits, d.habitLogs, today), [d.habits, d.habitLogs, today]);
  const bestStreak = useMemo(() => d.habits.filter((h) => !h.archivedAt).reduce((best, h) => Math.max(best, computeStreak(h, d.habitLogs, today, d.profile.weekStartsOn).current), 0), [d.habits, d.habitLogs, today, d.profile.weekStartsOn]);
  const nextWorkout = useMemo(() => nextScheduledWorkout(d.routines, d.sessions, now, tz), [d.routines, d.sessions, now, tz]);
  const last = useMemo(() => lastSession(d.sessions), [d.sessions]);
  const month = monthRange(today);
  const totals = useMemo(() => periodTotals(d.transactions, month.from, month.to), [d.transactions, month.from, month.to]);
  const balance = useMemo(() => totalBalance(d.accounts, d.transactions, today), [d.accounts, d.transactions, today]);
  const goal = d.goals.find((g) => !g.archivedAt);
  const hasFinance = d.accounts.length > 0 || d.transactions.length > 0;

  return (
    <Screen
      tabBarSpace
      header={
        <Row style={{ minHeight: 56, paddingTop: space.xs }}>
          <LogoMark size={30} />
          <View style={{ flex: 1 }}>
            <Text variant="heading">
              {greeting(now, tz)}
              {firstName ? `, ${firstName}` : ''}
            </Text>
            <Text variant="small" tone="muted">
              {capitalize(formatLongDate(today))}
            </Text>
          </View>
          <IconButton icon={Bell} label="Notificações e lembretes" onPress={() => router.push('/notifications')} />
          <Pressable accessibilityRole="button" accessibilityLabel="Perfil e configurações" onPress={() => router.push('/settings')} style={{ width: 34, height: 34, borderRadius: radius.pill, backgroundColor: colors.surface3, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
            {firstName ? (
              <Text variant="smallMedium" tone="silver">
                {firstName[0].toUpperCase()}
              </Text>
            ) : (
              <Settings size={16} color={colors.silver} />
            )}
          </Pressable>
        </Row>
      }
    >
      <AssistantCard />

      <Card>
        <SectionHeader title="Agenda de hoje" icon={CalendarDays} action="Ver agenda" onAction={() => router.push('/agenda')} />
        {todayEvents.length === 0 ? (
          <EmptyState icon={CalendarPlus} title="Nenhum compromisso hoje" description="Crie um evento ou peça ao assistente." action="Criar compromisso" onAction={() => router.push('/event/new')} />
        ) : (
          <View>
            {todayEvents.map((o) => (
              <EventRow key={o.key} o={o} now={now} tz={tz} />
            ))}
            <Pressable accessibilityRole="button" onPress={() => router.push(`/event/new?date=${today}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: space.md }}>
              <Plus size={16} color={colors.textMuted} />
              <Text variant="smallMedium" tone="muted">
                Adicionar compromisso
              </Text>
            </Pressable>
          </View>
        )}
      </Card>

      <View style={{ flexDirection: 'row', gap: space.md, flexWrap: 'wrap' }}>
        <Card style={{ flex: 1, minWidth: 260 }} onPress={() => router.push('/tasks')} accessibilityLabel="Tarefas">
          <SectionHeader title="Tarefas" icon={ListTodo} />
          <Row gap={space.lg}>
            <ProgressRing value={tasks.progress} size={60}>
              <Text variant="smallMedium">{Math.round(tasks.progress * 100)}%</Text>
            </ProgressRing>
            <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', rowGap: space.sm }}>
              <View style={{ width: '50%' }}>
                <Stat label="Total" value={String(tasks.total)} />
              </View>
              <View style={{ width: '50%' }}>
                <Stat label="Concluídas" value={String(tasks.done)} tone={tasks.done ? 'positive' : 'default'} />
              </View>
              <View style={{ width: '50%' }}>
                <Stat label="Pendentes" value={String(tasks.pending)} />
              </View>
              <View style={{ width: '50%' }}>
                <Stat label="Atrasadas" value={String(tasks.overdue)} tone={tasks.overdue ? 'negative' : 'default'} />
              </View>
            </View>
          </Row>
        </Card>

        <Card style={{ flex: 1, minWidth: 260 }} onPress={() => router.push('/habits')} accessibilityLabel="Hábitos">
          <SectionHeader title="Hábitos" icon={Repeat} />
          {habits.scheduled === 0 && d.habits.length === 0 ? (
            <Text variant="small" tone="muted">
              Nenhum hábito ainda. Toque para criar o primeiro.
            </Text>
          ) : (
            <View style={{ gap: space.md }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Stat label="Hoje" value={`${habits.done}/${habits.scheduled}`} />
                <Stat label="Maior sequência ativa" value={`${bestStreak} ${bestStreak === 1 ? 'dia' : 'dias'}`} />
              </Row>
              <ProgressBar value={habits.progress} tone={habits.progress >= 1 ? 'positive' : 'silver'} />
            </View>
          )}
        </Card>
      </View>

      <View style={{ flexDirection: 'row', gap: space.md, flexWrap: 'wrap' }}>
        <Card style={{ flex: 1, minWidth: 260 }} onPress={() => router.push('/workouts')} accessibilityLabel="Treinos">
          <SectionHeader title="Treinos" icon={Dumbbell} />
          <View style={{ gap: space.md }}>
            <View>
              <Text variant="small" tone="muted">
                Próximo treino
              </Text>
              <Text variant="bodyMedium" numberOfLines={1}>
                {nextWorkout ? nextWorkout.routine.name : 'Nada programado'}
              </Text>
              {nextWorkout && (
                <Text variant="small" tone="muted">
                  {relativeDayLabel(nextWorkout.date, today)}
                  {nextWorkout.time ? ` · ${nextWorkout.time}` : ''}
                </Text>
              )}
            </View>
            <View>
              <Text variant="small" tone="muted">
                Último treino
              </Text>
              <Text variant="bodyMedium" numberOfLines={1}>
                {last ? `${last.name} · ${relativeDayLabel(toDateKey(new Date(last.startedAt), tz), today)}` : 'Nenhum registro'}
              </Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => router.push(nextWorkout ? `/workouts/session?routineId=${nextWorkout.routine.id}` : '/workouts/session')} style={{ height: 38, borderRadius: radius.md, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderStrong }}>
              <Text variant="smallMedium">Registrar treino</Text>
            </Pressable>
          </View>
        </Card>

        <Card style={{ flex: 1, minWidth: 260 }} onPress={() => router.push('/finance')} accessibilityLabel="Finanças">
          <SectionHeader title="Finanças" icon={Wallet} />
          {!hasFinance ? (
            <Text variant="small" tone="muted">
              Sem lançamentos ainda. Toque para registrar o primeiro.
            </Text>
          ) : (
            <View style={{ gap: space.md }}>
              <View>
                <Text variant="small" tone="muted">
                  Saldo calculado
                </Text>
                <Text variant="number" tone={balance < 0 ? 'negative' : 'default'}>
                  {formatBRL(balance)}
                </Text>
              </View>
              <Row>
                <Stat label="Receitas do mês" value={formatBRL(totals.income)} tone="positive" />
                <Stat label="Despesas do mês" value={formatBRL(totals.expense)} tone={totals.expense > totals.income ? 'negative' : 'default'} />
              </Row>
              {goal && (
                <View style={{ gap: 6 }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text variant="small" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
                      Meta: {goal.name}
                    </Text>
                    <Text variant="small" tone="muted">
                      {Math.round(goalProgress(goal).progress * 100)}%
                    </Text>
                  </Row>
                  <ProgressBar value={goalProgress(goal).progress} tone="positive" />
                </View>
              )}
            </View>
          )}
        </Card>
      </View>
      {mode === 'demo' && (
        <Text variant="small" tone="faint" center>
          Valores de demonstração. Saia do modo demonstração em Configurações › Dados.
        </Text>
      )}
    </Screen>
  );
}
