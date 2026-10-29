import { useState, type ReactNode } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';
import { CalendarDays } from 'lucide-react-native';
import { colors, font, radius, space } from '@/theme/tokens';
import { addDaysKey, formatLongDate, isValidKey, isValidTime, makeKey } from '@/domain/time';
import type { DateKey, TimeOfDay } from '@/domain/types';
import { Text } from './Text';
import { Chip, ChipRow } from './primitives';
import { MonthGrid } from './MonthGrid';

export function Field({ label, error, hint, children }: { label?: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      {label && (
        <Text variant="smallMedium" tone="muted">
          {label}
        </Text>
      )}
      {children}
      {error ? (
        <Text variant="small" tone="negative" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small" tone="faint">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  right?: ReactNode;
}

export function TextField({ label, error, hint, right, style, multiline, ...rest }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <Field label={label} error={error} hint={hint}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          backgroundColor: colors.surface2,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: error ? colors.negative : focused ? colors.silverDim : colors.border,
          paddingHorizontal: space.md,
        }}
      >
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={colors.textFaint}
          selectionColor={colors.silver}
          multiline={multiline}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[
            { flex: 1, color: colors.text, fontFamily: font.regular, fontSize: 15, minHeight: multiline ? 88 : 46, paddingVertical: multiline ? space.md : 0, textAlignVertical: multiline ? 'top' : 'center' },
            // remove o contorno de foco padrão do navegador; o foco é indicado pela borda
            { outlineStyle: 'none' } as object,
            style,
          ]}
          {...rest}
        />
        {right}
      </View>
    </Field>
  );
}

const keyToBr = (k: DateKey | null) => (k ? k.split('-').reverse().join('/') : '');
function brToKey(s: string): DateKey | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const k = makeKey(Number(m[3]), Number(m[2]), Number(m[1]));
  return isValidKey(k) ? k : null;
}

/** Campo de data com digitação (dd/mm/aaaa), atalhos e calendário — funciona igual no celular e na web. */
export function DateField({ label, value, onChange, today, error, allowEmpty }: { label?: string; value: DateKey | null; onChange: (v: DateKey | null) => void; today: DateKey; error?: string; allowEmpty?: boolean }) {
  const [text, setText] = useState(keyToBr(value));
  const [open, setOpen] = useState(false);
  const [localError, setLocalError] = useState<string>();
  // sincroniza o texto quando o valor muda por fora (atalhos/calendário)
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setText(keyToBr(value));
  }
  const commit = (s: string) => {
    if (!s.trim() && allowEmpty) {
      setLocalError(undefined);
      onChange(null);
      return;
    }
    const k = brToKey(s);
    if (k) {
      setLocalError(undefined);
      onChange(k);
    } else setLocalError('Use o formato dd/mm/aaaa.');
  };
  return (
    <Field label={label} error={error ?? localError} hint={value ? formatLongDate(value) : undefined}>
      <TextField
        value={text}
        onChangeText={(s) => {
          const digits = s.replace(/\D/g, '').slice(0, 8);
          const masked = digits.length > 4 ? `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}` : digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
          setText(masked);
          if (masked.length === 10) commit(masked);
        }}
        onBlur={() => commit(text)}
        placeholder="dd/mm/aaaa"
        keyboardType="number-pad"
        right={
          <Pressable accessibilityRole="button" accessibilityLabel="Abrir calendário" onPress={() => setOpen((o) => !o)} hitSlop={8}>
            <CalendarDays size={18} color={open ? colors.text : colors.textMuted} />
          </Pressable>
        }
      />
      <ChipRow>
        <Chip label="Hoje" selected={value === today} onPress={() => onChange(today)} />
        <Chip label="Amanhã" selected={value === addDaysKey(today, 1)} onPress={() => onChange(addDaysKey(today, 1))} />
        <Chip label="+7 dias" selected={value === addDaysKey(today, 7)} onPress={() => onChange(addDaysKey(today, 7))} />
        {allowEmpty && <Chip label="Sem data" selected={value === null} onPress={() => onChange(null)} />}
      </ChipRow>
      {open && (
        <View style={{ backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.sm }}>
          <MonthGrid
            selected={value ?? today}
            today={today}
            onSelect={(k) => {
              onChange(k);
              setOpen(false);
            }}
          />
        </View>
      )}
    </Field>
  );
}

export function TimeField({ label, value, onChange, error, presets = ['08:00', '12:00', '14:00', '19:00'], allowEmpty }: { label?: string; value: TimeOfDay | null; onChange: (v: TimeOfDay | null) => void; error?: string; presets?: string[]; allowEmpty?: boolean }) {
  const [text, setText] = useState(value ?? '');
  const [localError, setLocalError] = useState<string>();
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setText(value ?? '');
  }
  const commit = (s: string) => {
    if (!s && allowEmpty) {
      setLocalError(undefined);
      onChange(null);
      return;
    }
    if (isValidTime(s)) {
      setLocalError(undefined);
      onChange(s);
    } else setLocalError('Use o formato HH:mm (ex.: 14:30).');
  };
  return (
    <Field label={label} error={error ?? localError}>
      <TextField
        value={text}
        placeholder="HH:mm"
        keyboardType="number-pad"
        onChangeText={(s) => {
          const d = s.replace(/\D/g, '').slice(0, 4);
          const masked = d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
          setText(masked);
          if (masked.length === 5) commit(masked);
          if (!masked && allowEmpty) commit('');
        }}
        onBlur={() => commit(text)}
      />
      <ChipRow>
        {presets.map((p) => (
          <Chip key={p} label={p} selected={value === p} onPress={() => onChange(p)} />
        ))}
        {allowEmpty && <Chip label="Sem horário" selected={value === null} onPress={() => onChange(null)} />}
      </ChipRow>
    </Field>
  );
}

export function SearchField(props: TextInputProps) {
  return <TextField placeholder="Pesquisar" returnKeyType="search" autoCorrect={false} {...props} />;
}
