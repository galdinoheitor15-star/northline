import { useEffect } from 'react';
import { View } from 'react-native';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { LogoMark } from '@/components/brand/Logo';
import { ConfirmHost, ToastHost, toast } from '@/components/ui/Overlay';
import { NotificationSync } from '@/services/notifications';
import { setDataErrorHandler } from '@/state/data';
import { useSession } from '@/state/session';
import { colors } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {});

const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, text: colors.text, border: colors.border, primary: colors.silver } };

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const initializing = useSession((s) => s.initializing);
  const mode = useSession((s) => s.mode);

  useEffect(() => {
    setDataErrorHandler((m) => toast.error(m));
    void useSession.getState().init();
  }, []);

  const ready = (fontsLoaded || !!fontError) && !initializing;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <LogoMark size={72} />
      </View>
    );
  }

  return (
    <ThemeProvider value={theme}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'fade' }}>
        <Stack.Protected guard={!!mode}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={!mode}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Screen name="reset-password" />
      </Stack>
      {mode && <NotificationSync />}
      <ConfirmHost />
      <ToastHost />
    </ThemeProvider>
  );
}
