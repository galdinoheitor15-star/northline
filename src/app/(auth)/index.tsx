import { useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarDays, Mic, Repeat, Wallet } from 'lucide-react-native';
import { LogoMark } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { confirm, toast } from '@/components/ui/Overlay';
import { isSupabaseConfigured } from '@/lib/env';
import { useSession } from '@/state/session';
import { colors, layout, radius, space } from '@/theme/tokens';

const SLIDES = [
  { icon: CalendarDays, title: 'Seu dia em uma linha', text: 'Agenda, tarefas, hábitos, treinos e dinheiro num painel só.' },
  { icon: Mic, title: 'Fale e confirme', text: '"Marca uma reunião amanhã às 15h." Você revisa a prévia e só então salva.' },
  { icon: Repeat, title: 'Consistência real', text: 'Sequências calculadas pelos dias programados, não por cliques.' },
  { icon: Wallet, title: 'Dinheiro sem chute', text: 'Saldos e totais derivados dos seus lançamentos, em centavos exatos.' },
];

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [busy, setBusy] = useState<'local' | 'demo' | null>(null);
  const { startLocal, startDemo } = useSession();
  const cardWidth = Math.min(width, layout.maxWidth) - layout.gutter * 2;

  const goLocal = async () => {
    const ok = await confirm({
      title: 'Usar sem conta?',
      message: 'Seus dados ficarão apenas neste aparelho, sem backup nem sincronização. Assistente com IA, voz e Google Agenda exigem conta.',
      confirmLabel: 'Continuar sem conta',
    });
    if (!ok) return;
    setBusy('local');
    await startLocal();
  };

  const goDemo = async () => {
    setBusy('demo');
    try {
      await startDemo();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.lg }}>
      <View style={{ width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', paddingHorizontal: layout.gutter, flex: 1 }}>
        <View style={{ alignItems: 'center', gap: space.md, marginTop: space.xl }}>
          <LogoMark size={64} />
          <Text variant="caption" tone="silver" style={{ letterSpacing: 5, fontSize: 13 }}>
            NORTHLINE
          </Text>
          <Text variant="display" center style={{ marginTop: space.lg }}>
            Organize sua rotina.{'\n'}Evolua todos os dias.
          </Text>
        </View>

        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginTop: space.xxxl }} contentContainerStyle={{ gap: 0 }} snapToInterval={cardWidth} decelerationRate="fast">
          {SLIDES.map((s) => (
            <View key={s.title} style={{ width: cardWidth, paddingRight: space.sm }}>
              <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: space.xl, gap: space.sm, minHeight: 150 }}>
                <s.icon size={22} color={colors.silver} strokeWidth={1.7} />
                <Text variant="heading">{s.title}</Text>
                <Text variant="body" tone="muted">
                  {s.text}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>
        <Text variant="small" tone="faint" center style={{ marginTop: space.sm }}>
          Deslize para ver mais
        </Text>

        <View style={{ flex: 1 }} />

        <View style={{ gap: space.sm }}>
          {isSupabaseConfigured ? (
            <>
              <Button label="Criar conta" onPress={() => router.push('/sign-up')} />
              <Button label="Já tenho conta" variant="secondary" onPress={() => router.push('/sign-in')} />
            </>
          ) : (
            <View style={{ backgroundColor: colors.surface2, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border }}>
              <Text variant="small" tone="muted">
                Backend não configurado: login e sincronização ficam disponíveis após definir as variáveis do Supabase (veja o README).
              </Text>
            </View>
          )}
          <Button label="Usar sem conta (só neste aparelho)" variant={isSupabaseConfigured ? 'ghost' : 'primary'} loading={busy === 'local'} onPress={goLocal} />
          <Button label="Explorar com dados de demonstração" variant="ghost" loading={busy === 'demo'} onPress={goDemo} />
        </View>
      </View>
    </View>
  );
}
