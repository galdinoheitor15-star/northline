import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { HABIT_ICON_MAP } from '@/components/HabitIcon';
import { WeekdayPicker } from '@/components/pickers';
import { Button } from '@/components/ui/Button';
import { DateField, Field, TextField, TimeField } from '@/components/ui/Input';
import { Chip, ChipRow, ToggleRow } from '@/components/ui/primitives';
import { toast } from '@/components/ui/Overlay';
import { Header, Screen } from '@/components/ui/Screen';
import type { Habit } from '@/domain/types';
import { useNow } from '@/hooks/useNow';
import { newId, nowIso } from '@/lib/id';
import { requestPermission, notificationsSupported } from '@/services/notifications';
import { useData } from '@/state/data';
import { colors, radius, space } from '@/theme/tokens';

export default function HabitForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { today } = useNow();
  const existing = useData((s) => s.habits.find((h) => h.id === id));
  const [h, setH] = useState<Habit>(
    () =>
      existing ?? {
        id: newId(),
        name: '',
        description: null,
        icon: 'check',
        frequency: 'daily',
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        dailyTarget: 1,
        weeklyTarget: null,
        time: null,
        reminderEnabled: false,
        startDate: today,
        archivedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
  );
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const patch = (p: Partial<Habit>) => setH((x) => ({ ...x, ...p }));

  const save = async () => {
    if (!h.name.trim()) return setError('Dê um nome ao hábito.');
    if (h.frequency === 'daily' && !h.weekdays.length) return setError('Escolha pelo menos um dia.');
    if (h.reminderEnabled && !h.time) return setError('Defina um horário para o lembrete.');
    setSaving(true);
    if (h.reminderEnabled && notificationsSupported) await requestPermission();
    const ok = await useData.getState().save('habits', { ...h, name: h.name.trim(), weeklyTarget: h.frequency === 'weekly' ? h.weeklyTarget ?? 3 : null, updatedAt: nowIso() });
    setSaving(false);
    if (ok) {
      toast.success(existing ? 'Hábito salvo.' : 'Hábito criado.');
      router.back();
    }
  };

  return (
    <Screen header={<Header title={existing ? 'Editar hábito' : 'Novo hábito'} back />} footer={<Button label={existing ? 'Salvar' : 'Criar hábito'} onPress={save} loading={saving} />}>
      <TextField label="Nome" value={h.name} onChangeText={(name) => patch({ name })} placeholder="Ex.: Ler 20 páginas" error={error} maxLength={80} autoFocus={!existing} />
      <TextField label="Descrição" value={h.description ?? ''} onChangeText={(d) => patch({ description: d || null })} placeholder="Opcional" multiline />
      <Field label="Ícone">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {Object.entries(HABIT_ICON_MAP).map(([key, Icon]) => (
            <Pressable key={key} accessibilityRole="button" accessibilityLabel={`Ícone ${key}`} accessibilityState={{ selected: h.icon === key }} onPress={() => patch({ icon: key })} style={{ width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: h.icon === key ? colors.silver : colors.border, backgroundColor: h.icon === key ? colors.surface3 : colors.surface2 }}>
              <Icon size={19} color={h.icon === key ? colors.text : colors.textMuted} strokeWidth={1.8} />
            </Pressable>
          ))}
        </View>
      </Field>
      <Field label="Frequência">
        <ChipRow>
          <Chip label="Dias específicos" selected={h.frequency === 'daily'} onPress={() => patch({ frequency: 'daily' })} />
          <Chip label="X vezes por semana" selected={h.frequency === 'weekly'} onPress={() => patch({ frequency: 'weekly', weeklyTarget: h.weeklyTarget ?? 3 })} />
        </ChipRow>
      </Field>
      {h.frequency === 'daily' ? (
        <Field label="Dias da semana">
          <WeekdayPicker value={h.weekdays} onChange={(weekdays) => patch({ weekdays })} />
          <ChipRow>
            <Chip label="Todos" onPress={() => patch({ weekdays: [0, 1, 2, 3, 4, 5, 6] })} />
            <Chip label="Dias úteis" onPress={() => patch({ weekdays: [1, 2, 3, 4, 5] })} />
          </ChipRow>
        </Field>
      ) : (
        <Field label="Meta semanal (dias)">
          <ChipRow>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <Chip key={n} label={`${n}×`} selected={h.weeklyTarget === n} onPress={() => patch({ weeklyTarget: n })} />
            ))}
          </ChipRow>
        </Field>
      )}
      <Field label="Meta diária (repetições)" hint="Ex.: 4 copos de água. O dia só conta quando a meta é atingida.">
        <ChipRow>
          {[1, 2, 3, 4, 5, 8].map((n) => (
            <Chip key={n} label={String(n)} selected={h.dailyTarget === n} onPress={() => patch({ dailyTarget: n })} />
          ))}
        </ChipRow>
      </Field>
      <TimeField label="Horário (opcional)" value={h.time} onChange={(time) => patch({ time, reminderEnabled: time ? h.reminderEnabled : false })} allowEmpty presets={['07:00', '12:00', '18:00', '21:30']} />
      <ToggleRow title="Lembrete no horário" subtitle={notificationsSupported ? undefined : 'Lembretes funcionam no app Android/iOS.'} value={h.reminderEnabled} onChange={(reminderEnabled) => patch({ reminderEnabled })} />
      <DateField label="Início" value={h.startDate} onChange={(startDate) => startDate && patch({ startDate })} today={today} />
    </Screen>
  );
}
