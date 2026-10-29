import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';
import { Text } from './ui/Text';

/** Faixa fixa que deixa claro quando os dados são de demonstração ou ficam só no aparelho. */
export function ModeBanner() {
  const mode = useSession((s) => s.mode);
  if (mode !== 'demo' && mode !== 'local') return null;
  const demo = mode === 'demo';
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push('/settings/data')} style={{ backgroundColor: demo ? colors.warningDim : colors.surface2, paddingVertical: 5, paddingHorizontal: space.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
        <Text variant="smallMedium" style={{ color: demo ? colors.warning : colors.textMuted, fontSize: 12 }}>
          {demo ? 'DEMONSTRAÇÃO · dados fictícios, não são seus' : 'Modo local · dados só neste aparelho'}
        </Text>
      </View>
    </Pressable>
  );
}
