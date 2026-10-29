import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { CalendarPlus, ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react-native';
import { EventRow } from '@/components/rows';
import { IconButton } from '@/components/ui/Button';
import { SearchField } from '@/components/ui/Input';
import { MonthGrid } from '@/components/ui/MonthGrid';
import { Card, EmptyState, Row, Segmented } from '@/components/ui/primitives';
import { Header, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { normalize } from '@/domain/nlp/normalize';
import { expandEvents } from '@/domain/recurrence';
import { addDaysKey, endOfDayUtc, endOfMonthKey, capitalize, formatLongDate, relativeDayLabel, startOfDayUtc, startOfMonthKey, startOfWeekKey, toDateKey } from '@/domain/time';
import type { EventOccurrence } from '@/domain/types';
import { useNow } from '@/hooks/useNow';
import { useData } from '@/state/data';
import { colors, radius, space } from '@/theme/tokens';

type View_ = 'day' | 'week' | 'month' | 'list';

function groupByDay(occ: EventOccurrence[], tz: string) {
  const map = new Map<string, EventOccurrence[]>();
  for (const o of occ) {
    const k = toDateKey(o.start, tz);
    map.set(k, [...(map.get(k) ?? []), o]);
  }
  return [...map.entries()];
}

export default function Agenda() {
  const { now, today, tz } = useNow();
  const events = useData((s) => s.events);
  const weekStartsOn = useData((s) => s.profile.weekStartsOn);
  const [view, setView] = useState<View_>('day');
  const [selected, setSelected] = useState(today);
  const [monthCursor, setMonthCursor] = useState(startOfMonthKey(today));
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState('');

  const range = useMemo(() => {
    if (q.trim()) return { from: addDaysKey(today, -90), to: addDaysKey(today, 365) };
    if (view === 'day') return { from: selected, to: selected };
    if (view === 'week') {
      const s = startOfWeekKey(selected, weekStartsOn);
      return { from: s, to: addDaysKey(s, 6) };
    }
    if (view === 'month') return { from: addDaysKey(monthCursor, -7), to: addDaysKey(endOfMonthKey(monthCursor), 14) };
    return { from: today, to: addDaysKey(today, 60) };
  }, [view, selected, monthCursor, today, weekStartsOn, q]);

  const occ = useMemo(() => {
    const all = expandEvents(events, startOfDayUtc(range.from, tz), endOfDayUtc(range.to, tz));
    const s = normalize(q.trim());
    return s ? all.filter((o) => normalize(`${o.event.title} ${o.event.description ?? ''} ${o.event.location ?? ''}`).includes(s)) : all;
  }, [events, range, tz, q]);

  const marks = useMemo(() => {
    const m: Record<string, number> = {};
    for (const o of occ) {
      const k = toDateKey(o.start, tz);
      m[k] = (m[k] ?? 0) + 1;
    }
    return m;
  }, [occ, tz]);

  const shift = (n: number) => setSelected((s) => addDaysKey(s, view === 'week' ? 7 * n : n));
  const dayOcc = occ.filter((o) => toDateKey(o.start, tz) === selected);

  const dayList = (list: EventOccurrence[], date: string) =>
    list.length === 0 ? (
      <EmptyState icon={CalendarPlus} title="Dia livre" description={capitalize(formatLongDate(date))} action="Adicionar compromisso" onAction={() => router.push(`/event/new?date=${date}`)} />
    ) : (
      list.map((o) => <EventRow key={o.key} o={o} now={now} tz={tz} />)
    );

  return (
    <Screen
      header={
        <Header
          title="Agenda"
          back
          right={
            <>
              <IconButton icon={Search} label="Pesquisar eventos" onPress={() => setSearchOpen((v) => !v)} />
              <IconButton icon={Plus} label="Novo compromisso" tone="filled" onPress={() => router.push(`/event/new?date=${selected}`)} />
            </>
          }
        />
      }
    >
      {searchOpen && <SearchField value={q} onChangeText={setQ} autoFocus placeholder="Pesquisar por título, local ou descrição" />}

      {q.trim() ? (
        <Card>
          {occ.length === 0 ? (
            <EmptyState icon={Search} title="Nenhum evento encontrado" />
          ) : (
            groupByDay(occ, tz).map(([day, list]) => (
              <View key={day} style={{ marginBottom: space.sm }}>
                <Text variant="caption" tone="muted" style={{ marginTop: space.sm }}>
                  {relativeDayLabel(day, today)}
                </Text>
                {list.map((o) => (
                  <EventRow key={o.key} o={o} now={now} tz={tz} />
                ))}
              </View>
            ))
          )}
        </Card>
      ) : (
        <>
          <Segmented
            options={[
              { value: 'day', label: 'Dia' },
              { value: 'week', label: 'Semana' },
              { value: 'month', label: 'Mês' },
              { value: 'list', label: 'Lista' },
            ]}
            value={view}
            onChange={setView}
          />

          {(view === 'day' || view === 'week') && (
            <Row style={{ justifyContent: 'space-between' }}>
              <IconButton icon={ChevronLeft} label={view === 'day' ? 'Dia anterior' : 'Semana anterior'} onPress={() => shift(-1)} />
              <Pressable accessibilityRole="button" accessibilityLabel="Voltar para hoje" onPress={() => setSelected(today)} style={{ alignItems: 'center' }}>
                <Text variant="bodyMedium">
                  {view === 'day' ? relativeDayLabel(selected, today) : `Semana de ${relativeDayLabel(range.from, today).toLowerCase()}`}
                </Text>
                {selected !== today && (
                  <Text variant="small" tone="silver">
                    Ir para hoje
                  </Text>
                )}
              </Pressable>
              <IconButton icon={ChevronRight} label={view === 'day' ? 'Próximo dia' : 'Próxima semana'} onPress={() => shift(1)} />
            </Row>
          )}

          {view === 'day' && (
            <Card>
              <Text variant="small" tone="muted" style={{ marginBottom: space.sm }}>
                {capitalize(formatLongDate(selected))}
              </Text>
              {dayList(dayOcc, selected)}
            </Card>
          )}

          {view === 'week' &&
            Array.from({ length: 7 }, (_, i) => addDaysKey(range.from, i)).map((day) => {
              const list = occ.filter((o) => toDateKey(o.start, tz) === day);
              return (
                <Card key={day} style={day === today ? { borderColor: colors.borderStrong } : undefined}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Pressable accessibilityRole="button" onPress={() => { setSelected(day); setView('day'); }}>
                      <Text variant="bodyMedium" tone={day === today ? 'default' : 'muted'}>
                        {relativeDayLabel(day, today)}
                      </Text>
                    </Pressable>
                    <IconButton icon={Plus} label="Adicionar neste dia" size={32} onPress={() => router.push(`/event/new?date=${day}`)} />
                  </Row>
                  {list.map((o) => (
                    <EventRow key={o.key} o={o} now={now} tz={tz} />
                  ))}
                </Card>
              );
            })}

          {view === 'month' && (
            <>
              <Card>
                <MonthGrid
                  selected={selected}
                  today={today}
                  marks={marks}
                  weekStartsOn={weekStartsOn}
                  onSelect={setSelected}
                  onMonthChange={(m) => setMonthCursor(m)}
                />
              </Card>
              <Card>
                <Text variant="small" tone="muted" style={{ marginBottom: space.sm }}>
                  {capitalize(formatLongDate(selected))}
                </Text>
                {dayList(dayOcc, selected)}
              </Card>
            </>
          )}

          {view === 'list' && (
            <Card>
              {occ.filter((o) => o.end >= now).length === 0 ? (
                <EmptyState icon={CalendarPlus} title="Nenhum compromisso nos próximos 60 dias" action="Criar compromisso" onAction={() => router.push('/event/new')} />
              ) : (
                groupByDay(
                  occ.filter((o) => o.end >= now),
                  tz,
                ).map(([day, list]) => (
                  <View key={day} style={{ marginBottom: space.sm }}>
                    <View style={{ backgroundColor: colors.surface2, borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: 4, marginTop: space.sm, alignSelf: 'flex-start' }}>
                      <Text variant="smallMedium" tone="muted">
                        {relativeDayLabel(day, today)}
                      </Text>
                    </View>
                    {list.map((o) => (
                      <EventRow key={o.key} o={o} now={now} tz={tz} />
                    ))}
                  </View>
                ))
              )}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
