import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { colors, radius, space } from '@/theme/tokens';
import { addDaysKey, addMonthsKey, MONTHS_LONG, parseKey, startOfMonthKey, startOfWeekKey, WEEKDAYS_LETTER, weekdayOfKey } from '@/domain/time';
import type { DateKey } from '@/domain/types';
import { Text } from './Text';

/** Calendário mensal reutilizado no seletor de datas e na visão mensal da agenda. */
export function MonthGrid({ selected, today, onSelect, marks, weekStartsOn = 0, onMonthChange }: { selected: DateKey; today: DateKey; onSelect: (k: DateKey) => void; marks?: Record<DateKey, number>; weekStartsOn?: 0 | 1; onMonthChange?: (monthStart: DateKey) => void }) {
  const [month, setMonth] = useState(startOfMonthKey(selected));
  const [prevSelected, setPrevSelected] = useState(selected);
  if (prevSelected !== selected) {
    setPrevSelected(selected);
    setMonth(startOfMonthKey(selected));
  }
  const { y, m } = parseKey(month);
  const gridStart = startOfWeekKey(month, weekStartsOn);
  const cells = Array.from({ length: 42 }, (_, i) => addDaysKey(gridStart, i));
  const inMonthAt = (i: number) => cells[i].slice(0, 7) === month.slice(0, 7);
  const rows = inMonthAt(35) ? 6 : inMonthAt(28) ? 5 : 4;
  const go = (n: number) => {
    const next = addMonthsKey(month, n)!;
    setMonth(next);
    onMonthChange?.(next);
  };
  const letters = Array.from({ length: 7 }, (_, i) => WEEKDAYS_LETTER[(i + weekStartsOn) % 7]);

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xs, marginBottom: space.sm }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Mês anterior" onPress={() => go(-1)} hitSlop={10} style={{ padding: 6 }}>
          <ChevronLeft size={18} color={colors.textMuted} />
        </Pressable>
        <Text variant="bodyMedium" style={{ textTransform: 'capitalize' }}>
          {MONTHS_LONG[m - 1]} {y}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Próximo mês" onPress={() => go(1)} hitSlop={10} style={{ padding: 6 }}>
          <ChevronRight size={18} color={colors.textMuted} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {letters.map((l, i) => (
          <Text key={i} variant="small" tone="faint" center style={{ flex: 1 }}>
            {l}
          </Text>
        ))}
      </View>
      {Array.from({ length: rows }, (_, r) => (
        <View key={r} style={{ flexDirection: 'row' }}>
          {cells.slice(r * 7, r * 7 + 7).map((k) => {
            const inMonth = k.slice(0, 7) === month.slice(0, 7);
            const isSel = k === selected;
            const isToday = k === today;
            const count = marks?.[k] ?? 0;
            return (
              <Pressable
                key={k}
                accessibilityRole="button"
                accessibilityLabel={`${parseKey(k).d} de ${MONTHS_LONG[parseKey(k).m - 1]}${count ? `, ${count} compromissos` : ''}`}
                accessibilityState={{ selected: isSel }}
                onPress={() => onSelect(k)}
                style={{ flex: 1, aspectRatio: 1.1, alignItems: 'center', justifyContent: 'center', padding: 2 }}
              >
                <View style={{ width: 34, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: isSel ? colors.silver : 'transparent', borderWidth: isToday && !isSel ? 1 : 0, borderColor: colors.silverDim }}>
                  <Text variant="smallMedium" style={{ color: isSel ? colors.onSilver : inMonth ? (weekdayOfKey(k) === 0 ? colors.textMuted : colors.text) : colors.textFaint }}>
                    {parseKey(k).d}
                  </Text>
                </View>
                <View style={{ height: 4, flexDirection: 'row', gap: 2, marginTop: 1 }}>
                  {Array.from({ length: Math.min(count, 3) }, (_, i) => (
                    <View key={i} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: inMonth ? colors.silverDim : colors.border }} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
