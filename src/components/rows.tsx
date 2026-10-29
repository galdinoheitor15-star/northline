import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Bell, Check, Link2, MapPin, Repeat, RefreshCw } from 'lucide-react-native';
import { categoryLabel, occurrenceDurationMinutes, occurrenceStatus } from '@/domain/events';
import { isOverdue } from '@/domain/tasks';
import { formatDuration, relativeDayLabel, toDateKey, toTimeOfDay } from '@/domain/time';
import type { EventOccurrence, Task } from '@/domain/types';
import { toggleTask } from '@/state/actions';
import { colors, radius, space } from '@/theme/tokens';
import { Text } from './ui/Text';
import { containerRole } from './ui/primitives';

export function occurrenceHref(o: EventOccurrence) {
  return `/event/${o.event.id}${o.event.recurrence ? `?occurrence=${encodeURIComponent(o.start.toISOString())}` : ''}`;
}

export function EventRow({ o, now, tz, showDay, today }: { o: EventOccurrence; now: Date; tz: string; showDay?: boolean; today?: string }) {
  const status = occurrenceStatus(o, now);
  const minutes = occurrenceDurationMinutes(o);
  const catColor = colors.category[o.event.category];
  const label = status === 'done' ? 'Concluído' : status === 'now' ? 'Agora' : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${o.event.title}, ${o.event.allDay ? 'dia inteiro' : toTimeOfDay(o.start, tz)}, ${categoryLabel(o.event.category)}`}
      onPress={() => router.push(occurrenceHref(o) as never)}
      style={({ pressed }) => ({ flexDirection: 'row', gap: space.md, paddingVertical: space.sm + 2, opacity: status === 'done' ? 0.55 : 1, backgroundColor: pressed ? colors.surface2 : 'transparent', borderRadius: radius.sm })}
    >
      <View style={{ width: 50, alignItems: 'flex-end' }}>
        <Text variant="smallMedium" style={{ fontVariant: ['tabular-nums'] }}>
          {o.event.allDay ? 'Dia' : toTimeOfDay(o.start, tz)}
        </Text>
        <Text variant="small" tone="faint" style={{ fontSize: 11 }}>
          {o.event.allDay ? 'inteiro' : formatDuration(minutes)}
        </Text>
      </View>
      <View style={{ width: 3, borderRadius: 2, backgroundColor: status === 'now' ? colors.silver : catColor }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyMedium" numberOfLines={1}>
          {o.event.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
          {showDay && today && (
            <Text variant="small" tone="muted">
              {relativeDayLabel(toDateKey(o.start, tz), today)}
            </Text>
          )}
          <Text variant="small" tone="muted">
            {categoryLabel(o.event.category)}
          </Text>
          {label && (
            <Text variant="small" tone={status === 'now' ? 'silver' : 'faint'}>
              · {label}
            </Text>
          )}
          {o.event.reminderMinutes != null && <Bell size={12} color={colors.textFaint} accessibilityLabel="Com lembrete" />}
          {o.isRecurring && <Repeat size={12} color={colors.textFaint} accessibilityLabel="Recorrente" />}
          {o.event.location && <MapPin size={12} color={colors.textFaint} />}
          {o.event.meetingUrl && <Link2 size={12} color={colors.textFaint} />}
          {o.event.externalId && <RefreshCw size={12} color={o.event.syncStatus === 'conflict' ? colors.warning : colors.textFaint} accessibilityLabel="Google Agenda" />}
        </View>
      </View>
    </Pressable>
  );
}

export function Checkbox({ checked, onPress, label }: { checked: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      hitSlop={10}
      onPress={onPress}
      style={{ width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: checked ? colors.positive : colors.borderStrong, backgroundColor: checked ? colors.positive : 'transparent', alignItems: 'center', justifyContent: 'center' }}
    >
      {checked && <Check size={14} color={colors.onSilver} strokeWidth={3} />}
    </Pressable>
  );
}

const PRIORITY_COLOR = { high: colors.negative, medium: colors.silverDim, low: colors.textFaint } as const;

export function TaskRow({ task, today, nowTime }: { task: Task; today: string; nowTime: string }) {
  const overdue = isOverdue(task, today, nowTime);
  const done = !!task.completedAt;
  const subDone = task.subtasks.filter((s) => s.done).length;
  return (
    <Pressable accessibilityRole={containerRole} accessibilityLabel={task.title} onPress={() => router.push(`/task/${task.id}` as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm + 2, backgroundColor: pressed ? colors.surface2 : 'transparent', borderRadius: radius.sm })}>
      <Checkbox checked={done} onPress={() => void toggleTask(task)} label={done ? `Desmarcar ${task.title}` : `Concluir ${task.title}`} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyMedium" tone={done ? 'faint' : 'default'} style={done ? { textDecorationLine: 'line-through' } : undefined} numberOfLines={2}>
          {task.title}
        </Text>
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center', flexWrap: 'wrap' }}>
          {task.dueDate && (
            <Text variant="small" tone={overdue ? 'negative' : 'muted'}>
              {overdue ? 'Atrasada · ' : ''}
              {relativeDayLabel(task.dueDate, today)}
              {task.dueTime ? ` ${task.dueTime}` : ''}
            </Text>
          )}
          {task.subtasks.length > 0 && (
            <Text variant="small" tone="faint">
              {subDone}/{task.subtasks.length}
            </Text>
          )}
          {task.recurrence && <Repeat size={12} color={colors.textFaint} />}
          {task.tags.slice(0, 2).map((t) => (
            <Text key={t} variant="small" tone="faint">
              #{t}
            </Text>
          ))}
        </View>
      </View>
      {!done && <View accessibilityLabel={`Prioridade ${task.priority}`} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: PRIORITY_COLOR[task.priority] }} />}
    </Pressable>
  );
}
