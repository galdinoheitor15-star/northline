import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { CheckCircle2, FolderPlus, ListTodo, Plus } from 'lucide-react-native';
import { TaskRow } from '@/components/rows';
import { Button, IconButton } from '@/components/ui/Button';
import { SearchField, TextField } from '@/components/ui/Input';
import { Card, Chip, EmptyState, ProgressBar, Row, Segmented, Stat } from '@/components/ui/primitives';
import { confirm, Sheet, toast } from '@/components/ui/Overlay';
import { Header, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { bucketOf, daySummary, matchesSearch, PRIORITIES, sortTasks, weekProgress } from '@/domain/tasks';
import { addDaysKey, relativeDayLabel, startOfWeekKey, toDateKey } from '@/domain/time';
import type { Priority, Task } from '@/domain/types';
import { useNow } from '@/hooks/useNow';
import { newId, nowIso } from '@/lib/id';
import { useData } from '@/state/data';
import { space } from '@/theme/tokens';

type ListKey = 'today' | 'upcoming' | 'overdue' | 'done' | 'all' | `list:${string}`;

export default function Tasks() {
  const { today, time, tz } = useNow();
  const tasks = useData((s) => s.tasks);
  const lists = useData((s) => s.taskLists);
  const weekStartsOn = useData((s) => s.profile.weekStartsOn);
  const [view, setView] = useState<'list' | 'week'>('list');
  const [list, setList] = useState<ListKey>('today');
  const [priority, setPriority] = useState<Priority | null>(null);
  const [q, setQ] = useState('');
  const [newListOpen, setNewListOpen] = useState(false);
  const [listName, setListName] = useState('');

  const summary = daySummary(tasks, today, (t) => (t.completedAt ? toDateKey(new Date(t.completedAt), tz) : null));
  const week = weekProgress(tasks, today, weekStartsOn);

  const filtered = useMemo(() => {
    let r = tasks.filter((t) => matchesSearch(t, q) && (!priority || t.priority === priority));
    if (list === 'today') r = r.filter((t) => ['today', 'overdue'].includes(bucketOf(t, today)) || (t.completedAt && toDateKey(new Date(t.completedAt), tz) === today));
    else if (list === 'upcoming') r = r.filter((t) => bucketOf(t, today) === 'upcoming');
    else if (list === 'overdue') r = r.filter((t) => bucketOf(t, today) === 'overdue');
    else if (list === 'done') r = r.filter((t) => !!t.completedAt);
    else if (list === 'all') r = r.filter((t) => !t.completedAt);
    else r = r.filter((t) => t.listId === list.slice(5));
    return sortTasks(r);
  }, [tasks, q, priority, list, today, tz]);

  const counts = {
    today: tasks.filter((t) => ['today', 'overdue'].includes(bucketOf(t, today))).length,
    upcoming: tasks.filter((t) => bucketOf(t, today) === 'upcoming').length,
    overdue: tasks.filter((t) => bucketOf(t, today) === 'overdue').length,
  };

  const weekStart = startOfWeekKey(today, weekStartsOn);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDaysKey(weekStart, i));

  const createList = async () => {
    const name = listName.trim();
    if (!name) return;
    const ts = nowIso();
    const id = newId();
    if (await useData.getState().save('taskLists', { id, name, color: null, createdAt: ts, updatedAt: ts })) {
      setList(`list:${id}`);
      setListName('');
      setNewListOpen(false);
      toast.success('Lista criada.');
    }
  };

  return (
    <Screen tabBarSpace header={<Header title="Tarefas" large right={<IconButton icon={Plus} label="Nova tarefa" tone="filled" onPress={() => router.push(list.startsWith('list:') ? `/task/new?listId=${list.slice(5)}` : '/task/new')} />} />}>
      <Card>
        <Row>
          <Stat label="Hoje" value={`${summary.done}/${summary.total}`} />
          <Stat label="Semana" value={`${week.done}/${week.total}`} />
          <Stat label="Atrasadas" value={String(summary.overdue)} tone={summary.overdue ? 'negative' : 'default'} />
        </Row>
        <View style={{ marginTop: space.md }}>
          <ProgressBar value={summary.progress} tone={summary.progress >= 1 ? 'positive' : 'silver'} />
        </View>
      </Card>

      <Segmented options={[{ value: 'list', label: 'Listas' }, { value: 'week', label: 'Semana' }]} value={view} onChange={setView} />

      {view === 'list' ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            <Chip label={`Hoje · ${counts.today}`} selected={list === 'today'} onPress={() => setList('today')} />
            <Chip label={`Próximas · ${counts.upcoming}`} selected={list === 'upcoming'} onPress={() => setList('upcoming')} />
            <Chip label={`Atrasadas · ${counts.overdue}`} selected={list === 'overdue'} onPress={() => setList('overdue')} />
            <Chip label="Todas pendentes" selected={list === 'all'} onPress={() => setList('all')} />
            <Chip label="Concluídas" selected={list === 'done'} onPress={() => setList('done')} />
            {lists.map((l) => (
              <Chip key={l.id} label={l.name} selected={list === `list:${l.id}`} onPress={() => setList(`list:${l.id}`)} />
            ))}
            <Chip label="Nova lista" icon={FolderPlus} onPress={() => setNewListOpen(true)} />
          </ScrollView>
          <SearchField value={q} onChangeText={setQ} placeholder="Pesquisar tarefas, descrições ou #tags" />
          <Row gap={space.sm} wrap>
            <Text variant="small" tone="muted">
              Prioridade:
            </Text>
            <Chip label="Todas" selected={!priority} onPress={() => setPriority(null)} />
            {PRIORITIES.map((p) => (
              <Chip key={p.id} label={p.label} selected={priority === p.id} onPress={() => setPriority(p.id)} />
            ))}
          </Row>
          <Card>
            {filtered.length === 0 ? (
              <EmptyState
                icon={list === 'done' ? CheckCircle2 : ListTodo}
                title={q ? 'Nada encontrado' : list === 'overdue' ? 'Nenhuma tarefa atrasada' : 'Nenhuma tarefa aqui'}
                description={q ? 'Tente outro termo.' : 'Adicione uma tarefa ou peça ao assistente.'}
                action={q ? undefined : 'Nova tarefa'}
                onAction={() => router.push('/task/new')}
              />
            ) : (
              filtered.map((t) => <TaskRow key={t.id} task={t} today={today} nowTime={time} />)
            )}
          </Card>
          {list.startsWith('list:') && (
            <Button
              label="Excluir esta lista"
              variant="ghost"
              onPress={async () => {
                const id = list.slice(5);
                if (await confirm({ title: 'Excluir lista?', message: 'As tarefas não serão apagadas; apenas deixam de pertencer à lista.', destructive: true, confirmLabel: 'Excluir' })) {
                  const affected: Task[] = tasks.filter((t) => t.listId === id).map((t) => ({ ...t, listId: null, updatedAt: nowIso() }));
                  if (affected.length) await useData.getState().save('tasks', affected);
                  await useData.getState().remove('taskLists', id);
                  setList('today');
                }
              }}
            />
          )}
        </>
      ) : (
        weekDays.map((day) => {
          const dayTasks = sortTasks(tasks.filter((t) => t.dueDate === day && matchesSearch(t, q)));
          return (
            <Card key={day}>
              <Row style={{ justifyContent: 'space-between', marginBottom: dayTasks.length ? space.xs : 0 }}>
                <Text variant="bodyMedium" tone={day === today ? 'default' : 'muted'}>
                  {relativeDayLabel(day, today)}
                </Text>
                <Text variant="small" tone="faint">
                  {dayTasks.filter((t) => t.completedAt).length}/{dayTasks.length}
                </Text>
              </Row>
              {dayTasks.map((t) => (
                <TaskRow key={t.id} task={t} today={today} nowTime={time} />
              ))}
            </Card>
          );
        })
      )}

      <Sheet visible={newListOpen} onClose={() => setNewListOpen(false)} title="Nova lista">
        <View style={{ gap: space.md }}>
          <TextField label="Nome" value={listName} onChangeText={setListName} autoFocus onSubmitEditing={createList} maxLength={60} />
          <Button label="Criar lista" onPress={createList} disabled={!listName.trim()} />
        </View>
      </Sheet>
    </Screen>
  );
}
