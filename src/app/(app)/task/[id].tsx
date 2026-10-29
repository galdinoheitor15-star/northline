import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CalendarPlus, Plus, Trash2, X } from 'lucide-react-native';
import { CategoryPicker, RecurrencePicker, ReminderPicker } from '@/components/pickers';
import { Checkbox } from '@/components/rows';
import { Button, IconButton } from '@/components/ui/Button';
import { DateField, Field, TextField, TimeField } from '@/components/ui/Input';
import { Card, Chip, ChipRow, Row } from '@/components/ui/primitives';
import { confirm, toast } from '@/components/ui/Overlay';
import { Header, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { PRIORITIES } from '@/domain/tasks';
import type { Task } from '@/domain/types';
import { useNow } from '@/hooks/useNow';
import { newId, nowIso } from '@/lib/id';
import { convertTaskToEvent, toggleTask } from '@/state/actions';
import { useData } from '@/state/data';
import { colors, space } from '@/theme/tokens';

export default function TaskForm() {
  const { id, listId, date } = useLocalSearchParams<{ id: string; listId?: string; date?: string }>();
  const { today } = useNow();
  const existing = useData((s) => s.tasks.find((t) => t.id === id));
  const lists = useData((s) => s.taskLists);
  const defaultReminder = useData((s) => s.profile.defaultReminderMinutes);
  const isNew = id === 'new' || !existing;

  const [t, setT] = useState<Task>(
    () =>
      existing ?? {
        id: newId(),
        title: '',
        description: null,
        dueDate: date ?? today,
        dueTime: null,
        priority: 'medium',
        category: 'personal',
        tags: [],
        listId: listId ?? null,
        recurrence: null,
        reminderMinutes: null,
        completedAt: null,
        eventId: null,
        subtasks: [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
  );
  const [tagsText, setTagsText] = useState(t.tags.join(', '));
  const [newSub, setNewSub] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const patch = (p: Partial<Task>) => setT((x) => ({ ...x, ...p }));

  if (id !== 'new' && !existing) {
    return (
      <Screen header={<Header title="Tarefa" back />}>
        <Text tone="muted">Esta tarefa não existe mais.</Text>
      </Screen>
    );
  }

  const save = async () => {
    if (!t.title.trim()) return setError('Informe um título.');
    if (t.dueTime && !t.dueDate) return setError('Defina uma data para usar horário.');
    setSaving(true);
    const tags = tagsText
      .split(',')
      .map((s) => s.trim().replace(/^#/, ''))
      .filter(Boolean)
      .slice(0, 20);
    const ok = await useData.getState().save('tasks', { ...t, title: t.title.trim(), tags, reminderMinutes: t.dueDate ? t.reminderMinutes : null, updatedAt: nowIso() });
    setSaving(false);
    if (ok) {
      toast.success(isNew ? 'Tarefa criada.' : 'Tarefa salva.');
      router.back();
    }
  };

  const remove = async () => {
    if (!(await confirm({ title: 'Excluir tarefa?', message: `"${t.title}" será excluída permanentemente.`, destructive: true, confirmLabel: 'Excluir' }))) return;
    if (await useData.getState().remove('tasks', t.id)) {
      toast.show('Tarefa excluída.');
      router.back();
    }
  };

  const convert = async () => {
    try {
      if (!existing) return toast.error('Salve a tarefa antes de converter.');
      const ev = await convertTaskToEvent({ ...existing, ...t });
      if (ev) {
        toast.success('Compromisso criado na agenda.');
        router.push(`/event/${ev.id}`);
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Screen
      header={<Header title={isNew ? 'Nova tarefa' : 'Editar tarefa'} back right={!isNew ? <IconButton icon={Trash2} label="Excluir tarefa" onPress={remove} /> : undefined} />}
      footer={<Button label={isNew ? 'Criar tarefa' : 'Salvar'} onPress={save} loading={saving} />}
    >
      {!isNew && existing && (
        <Card>
          <Row>
            <Checkbox checked={!!existing.completedAt} onPress={() => void toggleTask(existing)} label="Concluída" />
            <Text style={{ flex: 1 }}>{existing.completedAt ? 'Concluída' : 'Marcar como concluída'}</Text>
          </Row>
        </Card>
      )}
      <TextField label="Título" value={t.title} onChangeText={(title) => patch({ title })} placeholder="O que precisa ser feito?" error={error} autoFocus={isNew} maxLength={200} />
      <TextField label="Descrição" value={t.description ?? ''} onChangeText={(description) => patch({ description: description || null })} multiline placeholder="Opcional" />
      <DateField label="Vencimento" value={t.dueDate} onChange={(dueDate) => patch({ dueDate, dueTime: dueDate ? t.dueTime : null })} today={today} allowEmpty />
      {t.dueDate && <TimeField label="Horário" value={t.dueTime} onChange={(dueTime) => patch({ dueTime, reminderMinutes: dueTime && t.reminderMinutes == null ? defaultReminder : t.reminderMinutes })} allowEmpty />}
      <Field label="Prioridade">
        <ChipRow>
          {PRIORITIES.map((p) => (
            <Chip key={p.id} label={p.label} selected={t.priority === p.id} onPress={() => patch({ priority: p.id })} />
          ))}
        </ChipRow>
      </Field>
      <CategoryPicker value={t.category} onChange={(category) => patch({ category })} />
      <TextField label="Tags" value={tagsText} onChangeText={setTagsText} placeholder="faculdade, casa" hint="Separe por vírgula." autoCapitalize="none" />
      {lists.length > 0 && (
        <Field label="Lista">
          <ChipRow>
            <Chip label="Nenhuma" selected={!t.listId} onPress={() => patch({ listId: null })} />
            {lists.map((l) => (
              <Chip key={l.id} label={l.name} selected={t.listId === l.id} onPress={() => patch({ listId: l.id })} />
            ))}
          </ChipRow>
        </Field>
      )}
      {t.dueDate && <RecurrencePicker value={t.recurrence} onChange={(recurrence) => patch({ recurrence })} startDate={t.dueDate} />}
      {t.dueDate && <ReminderPicker value={t.reminderMinutes} onChange={(reminderMinutes) => patch({ reminderMinutes })} label={t.dueTime ? 'Lembrete' : 'Lembrete (referência: 9h)'} />}

      <Field label={`Subtarefas${t.subtasks.length ? ` · ${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length}` : ''}`}>
        <Card padded={false} style={{ paddingHorizontal: space.md }}>
          {t.subtasks.map((s) => (
            <Row key={s.id} style={{ paddingVertical: space.sm }}>
              <Checkbox checked={s.done} label={s.title} onPress={() => patch({ subtasks: t.subtasks.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)) })} />
              <Text style={{ flex: 1 }} tone={s.done ? 'faint' : 'default'}>
                {s.title}
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remover ${s.title}`} hitSlop={8} onPress={() => patch({ subtasks: t.subtasks.filter((x) => x.id !== s.id).map((x, j) => ({ ...x, position: j })) })}>
                <X size={16} color={colors.textFaint} />
              </Pressable>
            </Row>
          ))}
          <View style={{ paddingVertical: space.sm }}>
            <TextField
              value={newSub}
              onChangeText={setNewSub}
              placeholder="Adicionar subtarefa"
              onSubmitEditing={() => {
                if (!newSub.trim()) return;
                patch({ subtasks: [...t.subtasks, { id: newId(), title: newSub.trim(), done: false, position: t.subtasks.length }] });
                setNewSub('');
              }}
              right={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Adicionar subtarefa"
                  onPress={() => {
                    if (!newSub.trim()) return;
                    patch({ subtasks: [...t.subtasks, { id: newId(), title: newSub.trim(), done: false, position: t.subtasks.length }] });
                    setNewSub('');
                  }}
                >
                  <Plus size={18} color={colors.textMuted} />
                </Pressable>
              }
            />
          </View>
        </Card>
      </Field>

      {!isNew && (
        <Button
          label={t.eventId ? 'Ver compromisso vinculado' : 'Converter em compromisso'}
          icon={CalendarPlus}
          variant="secondary"
          onPress={() => (t.eventId ? router.push(`/event/${t.eventId}`) : convert())}
        />
      )}
    </Screen>
  );
}
