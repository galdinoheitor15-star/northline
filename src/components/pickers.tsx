import { useState } from 'react';
import { View } from 'react-native';
import { EVENT_CATEGORIES, REMINDER_OPTIONS } from '@/domain/events';
import { describeRecurrence } from '@/domain/recurrence';
import { WEEKDAYS_SHORT, weekdayOfKey } from '@/domain/time';
import type { DateKey, EventCategory, Recurrence } from '@/domain/types';
import { colors, space } from '@/theme/tokens';
import { Field, TextField } from './ui/Input';
import { Chip, ChipRow } from './ui/primitives';
import { Text } from './ui/Text';

export function CategoryPicker({ value, onChange }: { value: EventCategory; onChange: (c: EventCategory) => void }) {
  return (
    <Field label="Categoria">
      <ChipRow>
        {EVENT_CATEGORIES.map((c) => (
          <Chip key={c.id} label={c.label} color={colors.category[c.id]} selected={value === c.id} onPress={() => onChange(c.id)} />
        ))}
      </ChipRow>
    </Field>
  );
}

export function ReminderPicker({ value, onChange, label = 'Lembrete' }: { value: number | null; onChange: (v: number | null) => void; label?: string }) {
  const preset = REMINDER_OPTIONS.some((o) => o.value === value);
  const [custom, setCustom] = useState(!preset);
  const [text, setText] = useState(!preset && value != null ? String(value) : '');
  return (
    <Field label={label}>
      <ChipRow>
        {REMINDER_OPTIONS.map((o) => (
          <Chip
            key={String(o.value)}
            label={o.label}
            selected={!custom && value === o.value}
            onPress={() => {
              setCustom(false);
              onChange(o.value);
            }}
          />
        ))}
        <Chip label="Personalizado" selected={custom} onPress={() => setCustom(true)} />
      </ChipRow>
      {custom && (
        <TextField
          value={text}
          keyboardType="number-pad"
          placeholder="Minutos antes (ex.: 45)"
          onChangeText={(s) => {
            const d = s.replace(/\D/g, '').slice(0, 5);
            setText(d);
            if (d) onChange(Math.min(10080, Number(d)));
          }}
          hint="Até 7 dias (10080 min)."
        />
      )}
    </Field>
  );
}

export function RecurrencePicker({ value, onChange, startDate }: { value: Recurrence | null; onChange: (r: Recurrence | null) => void; startDate: DateKey }) {
  const freq = value?.freq ?? 'none';
  const days = value?.byWeekday ?? [weekdayOfKey(startDate)];
  return (
    <Field label="Repetição" hint={describeRecurrence(value)}>
      <ChipRow>
        <Chip label="Não repete" selected={freq === 'none'} onPress={() => onChange(null)} />
        <Chip label="Diária" selected={freq === 'daily'} onPress={() => onChange({ freq: 'daily', interval: 1, until: value?.until ?? null })} />
        <Chip label="Semanal" selected={freq === 'weekly'} onPress={() => onChange({ freq: 'weekly', interval: 1, byWeekday: days, until: value?.until ?? null })} />
        <Chip label="Mensal" selected={freq === 'monthly'} onPress={() => onChange({ freq: 'monthly', interval: 1, until: value?.until ?? null })} />
        <Chip label="Anual" selected={freq === 'yearly'} onPress={() => onChange({ freq: 'yearly', interval: 1, until: value?.until ?? null })} />
      </ChipRow>
      {value?.freq === 'weekly' && (
        <View style={{ gap: space.xs }}>
          <Text variant="small" tone="muted">
            Dias da semana
          </Text>
          <WeekdayPicker
            value={days}
            onChange={(d) => onChange({ ...value, byWeekday: d.length ? d : [weekdayOfKey(startDate)] })}
          />
        </View>
      )}
      {value && (
        <ChipRow>
          {[1, 2, 3, 4].map((n) => (
            <Chip key={n} label={n === 1 ? 'Toda vez' : `A cada ${n}`} selected={value.interval === n} onPress={() => onChange({ ...value, interval: n })} />
          ))}
        </ChipRow>
      )}
    </Field>
  );
}

export function WeekdayPicker({ value, onChange }: { value: number[]; onChange: (d: number[]) => void }) {
  return (
    <ChipRow>
      {WEEKDAYS_SHORT.map((label, i) => (
        <Chip key={i} label={label} selected={value.includes(i)} onPress={() => onChange(value.includes(i) ? value.filter((x) => x !== i) : [...value, i].sort())} />
      ))}
    </ChipRow>
  );
}
