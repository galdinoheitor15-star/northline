import { router } from 'expo-router';
import { Bell, CalendarDays, Dumbbell, Link2, Settings, Sparkles, User, Wallet, Database } from 'lucide-react-native';
import { Divider, Group, ListRow } from '@/components/ui/primitives';
import { Header, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useSession } from '@/state/session';

export default function More() {
  const mode = useSession((s) => s.mode);
  const user = useSession((s) => s.user);
  return (
    <Screen tabBarSpace header={<Header title="Mais" large />}>
      <Group>
        <ListRow icon={CalendarDays} title="Agenda" subtitle="Dia, semana, mês e lista" onPress={() => router.push('/agenda')} />
        <Divider inset={64} />
        <ListRow icon={Dumbbell} title="Treinos" subtitle="Rotinas, registros e evolução" onPress={() => router.push('/workouts')} />
        <Divider inset={64} />
        <ListRow icon={Wallet} title="Finanças" subtitle="Saldo, lançamentos e metas" onPress={() => router.push('/finance')} />
        <Divider inset={64} />
        <ListRow icon={Sparkles} title="Assistente" subtitle="Texto e voz" onPress={() => router.push('/assistant')} />
      </Group>
      <Group>
        <ListRow icon={User} title="Perfil" subtitle={user?.email ?? (mode === 'demo' ? 'Demonstração' : 'Modo local')} onPress={() => router.push('/settings/profile')} />
        <Divider inset={64} />
        <ListRow icon={Bell} title="Notificações" onPress={() => router.push('/settings/notifications')} />
        <Divider inset={64} />
        <ListRow icon={Link2} title="Conexões" subtitle="Google Agenda" onPress={() => router.push('/settings/connections')} />
        <Divider inset={64} />
        <ListRow icon={Database} title="Dados e privacidade" onPress={() => router.push('/settings/data')} />
        <Divider inset={64} />
        <ListRow icon={Settings} title="Configurações" onPress={() => router.push('/settings')} />
      </Group>
      <Text variant="small" tone="faint" center>
        Northline 1.0.0
      </Text>
    </Screen>
  );
}
