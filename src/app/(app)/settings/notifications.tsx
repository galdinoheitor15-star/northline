import { useEffect, useState } from 'react';
import { CalendarDays, Dumbbell, ListTodo, Repeat } from 'lucide-react-native';
import { ReminderPicker } from '@/components/pickers';
import { Button } from '@/components/ui/Button';
import { Card, Divider, Group, ToggleRow } from '@/components/ui/primitives';
import { Header, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { getPermissionStatus, notificationsSupported, requestPermission, syncNotifications } from '@/services/notifications';
import type { NotificationPrefs } from '@/domain/types';
import { useData } from '@/state/data';

export default function NotificationSettings() {
  const profile = useData((s) => s.profile);
  const update = useData((s) => s.updateProfile);
  const [perm, setPerm] = useState('…');
  useEffect(() => void getPermissionStatus().then(setPerm), []);
  const set = (k: keyof NotificationPrefs, v: boolean) => void update({ notifications: { ...profile.notifications, [k]: v } });

  return (
    <Screen header={<Header title="Notificações" back />}>
      {notificationsSupported ? (
        perm !== 'granted' && (
          <Card>
            <Text variant="small" style={{ marginBottom: 8 }}>
              {perm === 'denied' ? 'As notificações estão bloqueadas para o Northline. Ative nas configurações do sistema.' : 'Permita notificações para receber os lembretes.'}
            </Text>
            {perm !== 'denied' && <Button label="Permitir notificações" size="sm" onPress={async () => { await requestPermission(); setPerm(await getPermissionStatus()); void syncNotifications(); }} />}
          </Card>
        )
      ) : (
        <Card>
          <Text variant="small" tone="muted">
            Na web as notificações do aparelho não são usadas. As preferências abaixo valem para o app Android/iOS.
          </Text>
        </Card>
      )}
      <Group>
        <ToggleRow icon={CalendarDays} title="Compromissos e reuniões" value={profile.notifications.events} onChange={(v) => set('events', v)} />
        <Divider inset={64} />
        <ToggleRow icon={ListTodo} title="Tarefas com prazo" value={profile.notifications.tasks} onChange={(v) => set('tasks', v)} />
        <Divider inset={64} />
        <ToggleRow icon={Repeat} title="Hábitos programados" value={profile.notifications.habits} onChange={(v) => set('habits', v)} />
        <Divider inset={64} />
        <ToggleRow icon={Dumbbell} title="Treinos programados" value={profile.notifications.workouts} onChange={(v) => set('workouts', v)} />
      </Group>
      <ReminderPicker label="Lembrete padrão para novos compromissos" value={profile.defaultReminderMinutes} onChange={(v) => void update({ defaultReminderMinutes: v })} />
      <Text variant="small" tone="faint">
        Os lembretes são notificações locais agendadas no aparelho (próximos 7 dias, até 60 por vez) e reagendadas sempre que algo muda. O sistema operacional pode atrasar a entrega em modo de economia de bateria. Lembretes do Google Agenda são enviados pelo próprio Google e não são duplicados aqui.
      </Text>
    </Screen>
  );
}
