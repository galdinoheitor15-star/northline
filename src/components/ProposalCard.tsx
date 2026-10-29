import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { AlertTriangle, CalendarClock, CheckCircle2, CircleSlash, Lightbulb, XCircle } from 'lucide-react-native';
import { categoryLabel, draftRange, findConflicts } from '@/domain/events';
import { formatBRL, parseMoneyToCents } from '@/domain/finance';
import type { Proposal } from '@/domain/proposals';
import { capitalize, formatLongDate, toDateKey, toTimeOfDay } from '@/domain/time';
import type { ProposalStatus } from '@/state/assistant';
import { useData } from '@/state/data';
import { colors, radius, space } from '@/theme/tokens';
import { Button } from './ui/Button';
import { DateField, TextField, TimeField } from './ui/Input';
import { Badge, Row } from './ui/primitives';
import { Text } from './ui/Text';

/**
 * Prévia editável de uma ação sugerida. Visualmente distinta de uma ação executada:
 * "Sugestão" (contorno) até confirmar; "Salvo" (verde) só depois que a gravação foi aceita.
 */
export function ProposalCard({ proposal: p, status, onChange, onConfirm, onDismiss }: { proposal: Proposal; status: { state: ProposalStatus; message?: string }; onChange: (p: Proposal) => void; onConfirm: () => void; onDismiss: () => void }) {
  const tz = useData((s) => s.profile.timezone);
  const events = useData((s) => s.events);
  const today = toDateKey(new Date(), tz);
  const [editing, setEditing] = useState(false);
  const [amountText, setAmountText] = useState(p.kind === 'create_transaction' ? (p.tx.amountCents / 100).toFixed(2).replace('.', ',') : '');
  const locked = status.state === 'done' || status.state === 'dismissed' || status.state === 'running';

  let conflicts: string[] = [];
  // conflitos ao vivo só valem enquanto é sugestão (depois de salvo, o próprio evento conflitaria)
  if (p.kind === 'create_event' && status.state === 'suggested') {
    try {
      const { start, end } = draftRange(p.draft);
      conflicts = findConflicts(events, start, end).map((o) => `${o.event.title} (${toTimeOfDay(o.start, tz)})`);
    } catch {
      conflicts = [];
    }
  }

  const title = { create_event: 'Novo compromisso', update_event: 'Alterar compromisso', cancel_event: 'Cancelar compromisso', create_task: 'Nova tarefa', create_transaction: 'Novo lançamento', log_habit: 'Registrar hábito', log_workout: 'Registrar treino' }[p.kind];

  return (
    <View style={{ borderRadius: radius.md, borderWidth: 1, borderStyle: status.state === 'suggested' ? 'dashed' : 'solid', borderColor: status.state === 'done' ? colors.positive : status.state === 'failed' ? colors.negative : colors.borderStrong, backgroundColor: colors.surface2, padding: space.md, gap: space.sm }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={6}>
          <CalendarClock size={14} color={colors.textMuted} />
          <Text variant="smallMedium">{title}</Text>
        </Row>
        {status.state === 'done' ? <Badge label="Salvo" tone="positive" /> : status.state === 'failed' ? <Badge label="Falhou" tone="negative" /> : status.state === 'dismissed' ? <Badge label="Descartado" /> : <Badge label="Sugestão · não salvo" tone="outline" />}
      </Row>

      {p.kind === 'create_event' && !editing && (
        <View style={{ gap: 2 }}>
          <Text variant="bodyMedium">{p.draft.title}</Text>
          <Text variant="small" tone="muted">
            {capitalize(formatLongDate(p.draft.date))}
          </Text>
          <Text variant="small" tone="muted">
            {p.draft.startTime}
            {(() => {
              try {
                const { end } = draftRange(p.draft);
                return ` – ${toTimeOfDay(end, tz)}`;
              } catch {
                return '';
              }
            })()}{' '}
            · {categoryLabel(p.draft.category)}
            {p.draft.recurrence ? ' · recorrente' : ''}
          </Text>
        </View>
      )}
      {p.kind === 'create_event' && editing && (
        <View style={{ gap: space.sm }}>
          <TextField label="Título" value={p.draft.title} onChangeText={(title) => onChange({ ...p, draft: { ...p.draft, title } })} />
          <DateField label="Data" value={p.draft.date} onChange={(date) => date && onChange({ ...p, draft: { ...p.draft, date } })} today={today} />
          <TimeField label="Horário" value={p.draft.startTime} onChange={(startTime) => startTime && onChange({ ...p, draft: { ...p.draft, startTime } })} />
        </View>
      )}

      {p.kind === 'create_task' && !editing && (
        <View style={{ gap: 2 }}>
          <Text variant="bodyMedium">{p.task.title}</Text>
          <Text variant="small" tone="muted">
            {p.task.dueDate ? `${capitalize(formatLongDate(p.task.dueDate))}${p.task.dueTime ? ` às ${p.task.dueTime}` : ''}` : 'Sem data'}
          </Text>
        </View>
      )}
      {p.kind === 'create_task' && editing && (
        <View style={{ gap: space.sm }}>
          <TextField label="Título" value={p.task.title} onChangeText={(t) => onChange({ ...p, task: { ...p.task, title: t } })} />
          <DateField label="Data" value={p.task.dueDate} onChange={(dueDate) => onChange({ ...p, task: { ...p.task, dueDate } })} today={today} allowEmpty />
          <TimeField label="Horário" value={p.task.dueTime} onChange={(dueTime) => onChange({ ...p, task: { ...p.task, dueTime } })} allowEmpty />
        </View>
      )}

      {p.kind === 'create_transaction' && !editing && (
        <View style={{ gap: 2 }}>
          <Text variant="bodyMedium">
            {p.tx.type === 'income' ? '+' : '−'}
            {formatBRL(p.tx.amountCents)} · {p.tx.category}
          </Text>
          <Text variant="small" tone="muted">
            {p.tx.description ? `${p.tx.description} · ` : ''}
            {capitalize(formatLongDate(p.tx.date))}
          </Text>
        </View>
      )}
      {p.kind === 'create_transaction' && editing && (
        <View style={{ gap: space.sm }}>
          <TextField
            label="Valor (R$)"
            value={amountText}
            keyboardType="decimal-pad"
            onChangeText={(v) => {
              setAmountText(v);
              const c = parseMoneyToCents(v);
              if (c && c > 0) onChange({ ...p, tx: { ...p.tx, amountCents: c } });
            }}
          />
          <TextField label="Descrição" value={p.tx.description ?? ''} onChangeText={(d) => onChange({ ...p, tx: { ...p.tx, description: d || null } })} />
        </View>
      )}

      {(p.kind === 'update_event' || p.kind === 'cancel_event' || p.kind === 'log_habit' || p.kind === 'log_workout') && <Text variant="small">{p.summary}</Text>}

      {(status.state === 'suggested' ? [...p.warnings.filter((w) => !w.startsWith('Conflito')), ...(conflicts.length ? [`Conflito com: ${conflicts.join(', ')}.`] : [])] : []).map((w) => (
        <Row key={w} gap={6} style={{ alignItems: 'flex-start' }}>
          <AlertTriangle size={13} color={colors.warning} style={{ marginTop: 2 }} />
          <Text variant="small" tone="warning" style={{ flex: 1 }}>
            {w}
          </Text>
        </Row>
      ))}

      {status.message && (
        <Row gap={6}>
          {status.state === 'done' ? <CheckCircle2 size={14} color={colors.positive} /> : status.state === 'failed' ? <XCircle size={14} color={colors.negative} /> : <Lightbulb size={14} color={colors.textMuted} />}
          <Text variant="small" tone={status.state === 'failed' ? 'negative' : 'muted'}>
            {status.message}
          </Text>
        </Row>
      )}

      {!locked && (
        <Row gap={space.sm} wrap>
          <Button label={p.kind === 'cancel_event' ? 'Confirmar cancelamento' : 'Confirmar e salvar'} size="sm" variant={p.kind === 'cancel_event' ? 'danger' : 'primary'} onPress={onConfirm} />
          {['create_event', 'create_task', 'create_transaction'].includes(p.kind) && <Button label={editing ? 'Concluir edição' : 'Editar'} size="sm" variant="secondary" onPress={() => setEditing((e) => !e)} />}
          {p.kind === 'create_task' && (
            <Button
              label="Salvar como compromisso"
              size="sm"
              variant="ghost"
              onPress={() => router.push(`/event/new?date=${p.task.dueDate ?? today}${p.task.dueTime ? `&time=${p.task.dueTime}` : ''}` as never)}
            />
          )}
          <Button label="Descartar" size="sm" variant="ghost" icon={CircleSlash} onPress={onDismiss} />
        </Row>
      )}
    </View>
  );
}
