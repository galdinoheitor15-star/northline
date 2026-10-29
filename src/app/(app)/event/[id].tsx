import { useMemo, useState } from 'react';
import { Linking, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AlertTriangle, ExternalLink, RefreshCw, Sparkles, Trash2 } from 'lucide-react-native';
import { CategoryPicker, RecurrencePicker, ReminderPicker } from '@/components/pickers';
import { Button, IconButton } from '@/components/ui/Button';
import { DateField, Field, TextField, TimeField } from '@/components/ui/Input';
import { Badge, Card, Chip, ChipRow, Row, ToggleRow } from '@/components/ui/primitives';
import { choose, confirm, toast } from '@/components/ui/Overlay';
import { Header, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { draftRange, findConflicts, validateEventDraft, type EventDraft } from '@/domain/events';
import { inferCategory } from '@/domain/assistant-local';
import { cleanTitle, extractDateTime, Extractor } from '@/domain/nlp/parse';
import { formatDuration, capitalize, formatLongDate, timeToMinutes, minutesToTime, toTimeOfDay } from '@/domain/time';
import { useNow } from '@/hooks/useNow';
import { cancelEvent, createEvent, draftFromEvent, updateEvent, type SeriesScope } from '@/state/actions';
import { useData } from '@/state/data';
import { colors, space } from '@/theme/tokens';

const DURATIONS = [15, 30, 45, 60, 90, 120];

export default function EventForm() {
  const params = useLocalSearchParams<{ id: string; date?: string; occurrence?: string; time?: string }>();
  const { now, today, tz } = useNow();
  const events = useData((s) => s.events);
  const defaultReminder = useData((s) => s.profile.defaultReminderMinutes);
  const existing = events.find((e) => e.id === params.id);
  const isNew = params.id === 'new' || !existing;
  const occurrenceStart = params.occurrence ? new Date(params.occurrence) : undefined;
  const occurrence = existing && occurrenceStart ? { start: occurrenceStart, end: new Date(occurrenceStart.getTime() + (new Date(existing.endAt).getTime() - new Date(existing.startAt).getTime())) } : undefined;

  const [d, setD] = useState<EventDraft>(() =>
    existing
      ? draftFromEvent(existing, occurrence)
      : {
          title: '',
          description: null,
          date: params.date ?? today,
          startTime: params.time ?? minutesToTime(Math.min(23 * 60, Math.ceil((timeToMinutes(toTimeOfDay(now, tz)) + 30) / 30) * 30)),
          endTime: null,
          durationMinutes: 60,
          allDay: false,
          timezone: tz,
          location: null,
          meetingUrl: null,
          category: 'personal',
          reminderMinutes: defaultReminder,
          recurrence: null,
        },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [nl, setNl] = useState('');
  const [nlInfo, setNlInfo] = useState<string | null>(null);
  const patch = (p: Partial<EventDraft>) => setD((x) => ({ ...x, ...p }));

  const range = useMemo(() => {
    try {
      return validateEventDraft(d).ok ? draftRange(d) : null;
    } catch {
      return null;
    }
  }, [d]);
  const conflicts = useMemo(() => (range ? findConflicts(events, range.start, range.end, existing?.id) : []), [events, range, existing?.id]);
  const durationMin = range ? Math.round((range.end.getTime() - range.start.getTime()) / 60_000) : null;

  if (params.id !== 'new' && !existing) {
    return (
      <Screen header={<Header title="Compromisso" back />}>
        <Text tone="muted">Este compromisso não existe mais.</Text>
      </Screen>
    );
  }

  // Preenchimento por linguagem natural (interpretação local, determinística). O usuário revisa antes de salvar.
  const applyNl = () => {
    const ex = new Extractor(nl);
    const info = extractDateTime(ex, { now, tz });
    const title = cleanTitle(ex.remainder());
    patch({
      title: title || d.title,
      date: info.date ?? d.date,
      startTime: info.time ?? d.startTime,
      endTime: info.endTime ?? null,
      durationMinutes: info.endTime ? null : info.durationMinutes ?? d.durationMinutes ?? 60,
      recurrence: info.recurrence ?? d.recurrence,
      category: inferCategory(nl),
    });
    const missing = !info.time ? (info.partOfDay ? ` Qual horário exatamente? (você disse "${info.partOfDay}")` : ' Horário não identificado — confira abaixo.') : '';
    setNlInfo(`Entendi: ${title || '(sem título)'} · ${capitalize(formatLongDate(info.date ?? d.date))}${info.time ? ` às ${info.time}` : ''}.${missing}${info.warnings.length ? ` ${info.warnings.join(' ')}` : ''}`);
  };

  const askScope = async (verb: string): Promise<SeriesScope | null> => {
    if (!existing?.recurrence || !occurrenceStart) return 'series';
    const r = await choose({
      title: `${verb} evento recorrente`,
      message: 'Aplicar a qual parte da série?',
      options: [
        { label: 'Somente esta ocorrência', value: 'single' },
        { label: 'Toda a série', value: 'series', destructive: verb === 'Excluir' },
      ],
    });
    return r as SeriesScope | null;
  };

  const save = async () => {
    const v = validateEventDraft(d);
    setErrors(v.errors);
    if (!v.ok) return;
    if (conflicts.length && !(await confirm({ title: 'Conflito de horário', message: `Este horário coincide com: ${conflicts.map((c) => c.event.title).join(', ')}. Salvar mesmo assim?`, confirmLabel: 'Salvar mesmo assim' }))) return;
    setSaving(true);
    try {
      if (isNew) {
        if (await createEvent(d)) {
          toast.success('Compromisso salvo.');
          router.back();
        }
      } else {
        const scope = await askScope('Editar');
        if (!scope) return;
        if (await updateEvent(existing!, d, scope, occurrenceStart)) {
          toast.success('Compromisso atualizado.');
          router.back();
        }
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    const scope = await askScope('Excluir');
    if (!scope) return;
    if (scope === 'series' && !(await confirm({ title: existing.recurrence ? 'Excluir toda a série?' : 'Excluir compromisso?', message: existing.externalId ? 'Também será cancelado no Google Agenda na próxima sincronização.' : 'Esta ação não pode ser desfeita.', destructive: true, confirmLabel: 'Excluir' }))) return;
    if (await cancelEvent(existing, scope, occurrenceStart)) {
      toast.show('Compromisso removido.');
      router.back();
    }
  };

  return (
    <Screen
      header={<Header title={isNew ? 'Novo compromisso' : 'Editar compromisso'} back right={!isNew ? <IconButton icon={Trash2} label="Excluir compromisso" onPress={remove} /> : undefined} />}
      footer={<Button label={isNew ? 'Salvar compromisso' : 'Salvar alterações'} onPress={save} loading={saving} />}
    >
      {isNew && (
        <Card>
          <View style={{ gap: space.sm }}>
            <Row gap={space.sm}>
              <Sparkles size={15} color={colors.silver} />
              <Text variant="smallMedium">Descreva em uma frase</Text>
            </Row>
            <TextField value={nl} onChangeText={setNl} placeholder="Reunião com a equipe sexta às 14h por 1 hora" onSubmitEditing={applyNl} returnKeyType="done" />
            <Button label="Preencher campos" size="sm" variant="secondary" onPress={applyNl} disabled={!nl.trim()} />
            {nlInfo && (
              <Text variant="small" tone="muted">
                {nlInfo}
              </Text>
            )}
          </View>
        </Card>
      )}

      {existing && (
        <Row wrap gap={space.sm}>
          <Badge label={`Origem: ${{ northline: 'Northline', assistant: 'Assistente', google: 'Google Agenda', task: 'Tarefa', workout: 'Treino' }[existing.source]}`} tone="outline" />
          {existing.recurrence && <Badge label={occurrenceStart ? 'Ocorrência de série' : 'Série recorrente'} tone="outline" />}
          {existing.externalId && <Badge label={{ local: 'Local', pending: 'Sincronização pendente', synced: 'Sincronizado', conflict: 'Conflito de edição', error: 'Erro de sincronização' }[existing.syncStatus]} tone={existing.syncStatus === 'conflict' || existing.syncStatus === 'error' ? 'warning' : 'default'} />}
        </Row>
      )}
      {existing?.syncStatus === 'conflict' && (
        <Card>
          <Row>
            <RefreshCw size={16} color={colors.warning} />
            <Text variant="small" style={{ flex: 1 }}>
              Este evento foi alterado aqui e no Google. Resolva o conflito em Configurações › Conexões.
            </Text>
          </Row>
        </Card>
      )}

      <TextField label="Título" value={d.title} onChangeText={(title) => patch({ title })} error={errors.title} maxLength={200} placeholder="Ex.: Reunião com a equipe" />
      <DateField label="Data" value={d.date} onChange={(date) => date && patch({ date })} today={today} error={errors.date} />
      <ToggleRow title="Dia inteiro" value={!!d.allDay} onChange={(allDay) => patch({ allDay })} />
      {!d.allDay && (
        <>
          <TimeField label="Início" value={d.startTime} onChange={(startTime) => startTime && patch({ startTime })} error={errors.startTime} presets={['08:00', '09:00', '14:00', '19:00']} />
          <Field label="Duração" error={errors.duration ?? errors.endTime} hint={range ? `Termina às ${toTimeOfDay(range.end, d.timezone)}${durationMin ? ` (${formatDuration(durationMin)})` : ''}` : undefined}>
            <ChipRow>
              {DURATIONS.map((m) => (
                <Chip key={m} label={formatDuration(m)} selected={!d.endTime && d.durationMinutes === m} onPress={() => patch({ durationMinutes: m, endTime: null })} />
              ))}
            </ChipRow>
          </Field>
          <TimeField label="…ou horário de término" value={d.endTime ?? null} onChange={(endTime) => patch({ endTime, durationMinutes: endTime ? null : 60 })} presets={[]} allowEmpty />
        </>
      )}
      {conflicts.length > 0 && (
        <Card style={{ borderColor: colors.warning }}>
          <Row>
            <AlertTriangle size={16} color={colors.warning} />
            <Text variant="small" style={{ flex: 1 }}>
              Conflito com {conflicts.map((c) => `${c.event.title} (${toTimeOfDay(c.start, tz)}–${toTimeOfDay(c.end, tz)})`).join(', ')}.
            </Text>
          </Row>
        </Card>
      )}
      <CategoryPicker value={d.category} onChange={(category) => patch({ category })} />
      <ReminderPicker value={d.reminderMinutes} onChange={(reminderMinutes) => patch({ reminderMinutes })} />
      {(!existing?.recurringEventId) && <RecurrencePicker value={d.recurrence} onChange={(recurrence) => patch({ recurrence })} startDate={d.date} />}
      <TextField label="Local" value={d.location ?? ''} onChangeText={(location) => patch({ location })} placeholder="Opcional" maxLength={300} />
      <TextField
        label="Link da reunião"
        value={d.meetingUrl ?? ''}
        onChangeText={(meetingUrl) => patch({ meetingUrl })}
        placeholder="https://"
        autoCapitalize="none"
        keyboardType="url"
        error={errors.meetingUrl}
        right={d.meetingUrl && /^https?:\/\//.test(d.meetingUrl) ? <IconButton icon={ExternalLink} label="Abrir link" size={34} onPress={() => Linking.openURL(d.meetingUrl!)} /> : undefined}
      />
      <TextField label="Descrição" value={d.description ?? ''} onChangeText={(description) => patch({ description })} multiline placeholder="Opcional" />
      <Text variant="small" tone="faint">
        Fuso horário: {d.timezone}
      </Text>
    </Screen>
  );
}
