import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useData } from '@/state/data';
import { useIntegrations } from '@/state/integrations';
import { useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

export default function AppLayout() {
  const status = useData((s) => s.status);
  const error = useData((s) => s.error);
  const mode = useSession((s) => s.mode);

  useEffect(() => {
    if (mode === 'supabase') void useIntegrations.getState().refresh().catch(() => {});
  }, [mode]);

  if (status === 'error') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md }}>
        <Text variant="heading">Não foi possível carregar seus dados</Text>
        <Text tone="muted" center>
          {error}
        </Text>
        <Button label="Tentar novamente" onPress={() => useData.getState().repo && useData.getState().hydrate(useData.getState().repo!)} />
        <Button label="Sair" variant="ghost" onPress={() => useSession.getState().signOut()} />
      </View>
    );
  }
  if (status !== 'ready') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.silver} />
      </View>
    );
  }
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }} />;
}
