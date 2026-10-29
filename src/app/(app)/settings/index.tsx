import { router } from 'expo-router';
import { Bell, Database, Globe, Link2, LogOut, User } from 'lucide-react-native';
import { Divider, Group, ListRow } from '@/components/ui/primitives';
import { confirm } from '@/components/ui/Overlay';
import { Header, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useData } from '@/state/data';
import { useSession } from '@/state/session';

export default function Settings() {
  const mode = useSession((s) => s.mode);
  const user = useSession((s) => s.user);
  const profile = useData((s) => s.profile);
  const signOut = useSession((s) => s.signOut);

  return (
    <Screen header={<Header title="Configurações" back />}>
      <Group>
        <ListRow icon={User} title="Perfil" subtitle={profile.displayName || user?.email || 'Sem nome'} onPress={() => router.push('/settings/profile')} />
        <Divider inset={64} />
        <ListRow icon={Globe} title="Região" subtitle={`${profile.timezone} · pt-BR · BRL`} onPress={() => router.push('/settings/profile')} />
        <Divider inset={64} />
        <ListRow icon={Bell} title="Notificações" onPress={() => router.push('/settings/notifications')} />
        <Divider inset={64} />
        <ListRow icon={Link2} title="Conexões externas" subtitle="Google Agenda" onPress={() => router.push('/settings/connections')} />
        <Divider inset={64} />
        <ListRow icon={Database} title="Dados e privacidade" subtitle="Exportar, excluir conta, demonstração" onPress={() => router.push('/settings/data')} />
      </Group>
      <Group>
        <ListRow
          icon={LogOut}
          title={mode === 'demo' ? 'Sair da demonstração' : mode === 'local' ? 'Sair do modo local' : 'Sair da conta'}
          danger
          chevron={false}
          onPress={async () => {
            const msg = mode === 'local' ? 'Seus dados locais continuam neste aparelho e voltam quando você entrar no modo local de novo.' : mode === 'demo' ? 'Os dados de demonstração serão descartados.' : 'Você precisará entrar novamente.';
            if (await confirm({ title: 'Sair?', message: msg, confirmLabel: 'Sair' })) await signOut();
          }}
        />
      </Group>
      <Text variant="small" tone="faint" center>
        {mode === 'supabase' ? `Conectado como ${user?.email}` : mode === 'local' ? 'Modo local: dados só neste aparelho' : 'Modo demonstração'}
      </Text>
    </Screen>
  );
}
