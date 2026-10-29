import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { diffSchedule, planNotifications, type PlannedNotification } from '@/domain/notifications-plan';
import { env, isSupabaseConfigured } from '@/lib/env';
import { getSupabase } from '@/lib/supabase';
import { useData } from '@/state/data';
import { useSession } from '@/state/session';

// Lembretes são notificações LOCAIS agendadas no aparelho a partir dos dados do usuário.
// O sistema operacional decide o momento exato de entrega; não há garantia de segundo exato.

export const notificationsSupported = Platform.OS === 'ios' || Platform.OS === 'android';

if (notificationsSupported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

export async function getPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined' | 'unsupported'> {
  if (!notificationsSupported) return 'unsupported';
  const p = await Notifications.getPermissionsAsync();
  return p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied';
}

export async function requestPermission(): Promise<boolean> {
  if (!notificationsSupported) return false;
  if (Platform.OS === 'android') {
    // eslint-disable-next-line import/namespace -- enum exportado via .d.ts (falso positivo do plugin)
    await Notifications.setNotificationChannelAsync('reminders', { name: 'Lembretes', importance: Notifications.AndroidImportance.HIGH });
  }
  const p = await Notifications.requestPermissionsAsync();
  return p.granted;
}

async function schedule(n: PlannedNotification) {
  await Notifications.scheduleNotificationAsync({
    identifier: n.id,
    content: { title: n.title, body: n.body, data: n.data, sound: true },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.fireAt, channelId: 'reminders' },
  });
}

/** Reconcilia o que está agendado no aparelho com o plano calculado (cancela antigos, agenda novos). */
export async function syncNotifications(): Promise<{ scheduled: number; cancelled: number } | null> {
  if (!notificationsSupported) return null;
  if ((await getPermissionStatus()) !== 'granted') return null;
  const s = useData.getState();
  const plan = planNotifications({
    now: new Date(),
    tz: s.profile.timezone,
    prefs: s.profile.notifications,
    events: s.events,
    tasks: s.tasks,
    habits: s.habits,
    habitLogs: s.habitLogs,
    routines: s.routines,
  });
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const { toCancel, toSchedule } = diffSchedule(scheduled.map((n) => n.identifier), plan);
  await Promise.all(toCancel.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
  for (const n of toSchedule) await schedule(n);
  return { scheduled: toSchedule.length, cancelled: toCancel.length };
}

export async function listScheduled(): Promise<{ id: string; title: string; body: string; date: Date | null }[]> {
  if (!notificationsSupported) return [];
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return all
    .map((n) => {
      const trig = n.trigger as { value?: number; date?: number | string } | null;
      const raw = trig?.value ?? trig?.date;
      return { id: n.identifier, title: n.content.title ?? '', body: n.content.body ?? '', date: raw ? new Date(raw) : null };
    })
    .sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));
}

/** Registra o token de push do aparelho (para notificações remotas futuras). Requer EAS projectId. */
export async function registerPushToken(): Promise<void> {
  if (!notificationsSupported || !isSupabaseConfigured || !env.easProjectId || useSession.getState().mode !== 'supabase') return;
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: env.easProjectId });
    await getSupabase().from('push_tokens').upsert({ token, platform: Platform.OS, last_seen_at: new Date().toISOString() }, { onConflict: 'user_id,token' });
  } catch {
    // sem token em emulador ou sem projectId: notificações locais continuam funcionando
  }
}

/** Componente invisível: reagenda lembretes quando os dados mudam e trata toques nas notificações. */
export function NotificationSync() {
  const revision = useData((s) => s.revision);
  const status = useData((s) => s.status);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (status !== 'ready' || !notificationsSupported) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void syncNotifications().catch(() => {}), 1200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [revision, status]);

  useEffect(() => {
    if (!notificationsSupported) return;
    void registerPushToken();
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const kind = (resp.notification.request.content.data as { kind?: string })?.kind;
      if (kind === 'events') router.push('/agenda');
      else if (kind === 'tasks') router.push('/tasks');
      else if (kind === 'habits') router.push('/habits');
      else if (kind === 'workouts') router.push('/workouts');
    });
    return () => sub.remove();
  }, []);

  return null;
}
