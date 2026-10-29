import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, BellOff, RefreshCw } from 'lucide-react-native';
import { router } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Card, EmptyState, Row } from '@/components/ui/primitives';
import { Header, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Overlay';
import { planNotifications } from '@/domain/notifications-plan';
import { relativeDayLabel, toDateKey, toTimeOfDay } from '@/domain/time';
import { useNow } from '@/hooks/useNow';
import { getPermissionStatus, notificationsSupported, requestPermission, syncNotifications } from '@/services/notifications';
import { useData } from '@/state/data';

/** Central de lembretes: mostra o que está programado para os próximos 7 dias. */
export default function NotificationCenter() {
  const { now, tz, today } = useNow();
  const d = useData();
  const [perm, setPerm] = useState<string>('…');
  const refresh = useCallback(() => void getPermissionStatus().then(setPerm), []);
  useEffect(refresh, [refresh]);

  const plan = useMemo(
    () => planNotifications({ now, tz, prefs: d.profile.notifications, events: d.events, tasks: d.tasks, habits: d.habits, habitLogs: d.habitLogs, routines: d.routines }),
    [now, tz, d.profile.notifications, d.events, d.tasks, d.habits, d.habitLogs, d.routines],
  );

  return (
    <Screen header={<Header title="Lembretes" back />}>
      <Card>
        {!notificationsSupported ? (
          <Text variant="small" tone="muted">
            Notificações do aparelho estão disponíveis no app Android/iOS. Na versão web, esta lista mostra o que seria lembrado.
          </Text>
        ) : perm === 'granted' ? (
          <Row>
            <Bell size={16} color="#4FB286" />
            <Text variant="small" style={{ flex: 1 }}>
              Notificações ativas. Lembretes dos próximos 7 dias são agendados no aparelho.
            </Text>
            <Button
              label="Sincronizar"
              size="sm"
              variant="secondary"
              icon={RefreshCw}
              onPress={async () => {
                const r = await syncNotifications();
                if (r) toast.success(`${r.scheduled} agendados, ${r.cancelled} removidos.`);
              }}
            />
          </Row>
        ) : (
          <Row>
            <BellOff size={16} color="#D9A441" />
            <Text variant="small" style={{ flex: 1 }}>
              {perm === 'denied' ? 'Permissão negada. Ative nas configurações do sistema.' : 'Permita notificações para receber lembretes.'}
            </Text>
            {perm !== 'denied' && <Button label="Permitir" size="sm" onPress={async () => { await requestPermission(); refresh(); void syncNotifications(); }} />}
          </Row>
        )}
      </Card>
      <Card>
        {plan.length === 0 ? (
          <EmptyState icon={Bell} title="Nenhum lembrete programado" description="Adicione lembretes a compromissos, tarefas, hábitos e treinos." action="Preferências" onAction={() => router.push('/settings/notifications')} />
        ) : (
          plan.map((n) => (
            <Row key={n.id} style={{ paddingVertical: 8 }}>
              <Text variant="smallMedium" style={{ width: 92 }}>
                {relativeDayLabel(toDateKey(n.fireAt, tz), today)} {toTimeOfDay(n.fireAt, tz)}
              </Text>
              <Text variant="small" style={{ flex: 1 }} numberOfLines={2}>
                {n.title} · <Text variant="small" tone="muted">{n.body}</Text>
              </Text>
            </Row>
          ))
        )}
      </Card>
    </Screen>
  );
}
