import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarPlus, CheckSquare, Dumbbell, Grid2x2, Home, ListTodo, Plus, Repeat, Sparkles, Wallet, type LucideIcon } from 'lucide-react-native';
import { Sheet } from '@/components/ui/Overlay';
import { Text } from '@/components/ui/Text';
import { colors, layout, radius, space } from '@/theme/tokens';

const ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  index: { icon: Home, label: 'Início' },
  tasks: { icon: ListTodo, label: 'Tarefas' },
  habits: { icon: Repeat, label: 'Hábitos' },
  more: { icon: Grid2x2, label: 'Mais' },
};

const QUICK: { icon: LucideIcon; label: string; href: string }[] = [
  { icon: CheckSquare, label: 'Tarefa', href: '/task/new' },
  { icon: CalendarPlus, label: 'Compromisso', href: '/event/new' },
  { icon: Repeat, label: 'Registrar hábito', href: '/habits' },
  { icon: Dumbbell, label: 'Registrar treino', href: '/workouts/session' },
  { icon: Wallet, label: 'Movimentação', href: '/finance/transaction' },
  { icon: Sparkles, label: 'Assistente', href: '/assistant' },
];

export default function TabsLayout() {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();

  return (
    <>
      <Tabs
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
        tabBar={({ state, navigateToTab }) => (
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingBottom: Math.max(insets.bottom, space.sm), paddingTop: space.sm, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border }}>
            <View style={{ flexDirection: 'row', width: '100%', maxWidth: layout.maxWidth, alignItems: 'center', paddingHorizontal: space.sm }}>
              {state.routes.map((route, index) => {
                if (route.name === 'add') {
                  return (
                    <View key={route.key} style={{ flex: 1, alignItems: 'center' }}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Adicionar"
                        onPress={() => setOpen(true)}
                        style={({ pressed }) => ({ width: 52, height: 52, borderRadius: radius.pill, backgroundColor: colors.silver, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.94 : 1 }] })}
                      >
                        <Plus size={26} color={colors.onSilver} strokeWidth={2.2} />
                      </Pressable>
                    </View>
                  );
                }
                const meta = ICONS[route.name];
                if (!meta) return null;
                const focused = state.index === index;
                const Icon = meta.icon;
                return (
                  <Pressable
                    key={route.key}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: focused }}
                    accessibilityLabel={meta.label}
                    onPress={() => {
                      if (!focused) navigateToTab(route.key);
                    }}
                    style={{ flex: 1, alignItems: 'center', gap: 3, paddingVertical: 4 }}
                  >
                    <Icon size={22} color={focused ? colors.text : colors.textFaint} strokeWidth={focused ? 2 : 1.7} />
                    <Text variant="small" style={{ fontSize: 11, color: focused ? colors.text : colors.textFaint }}>
                      {meta.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="tasks" />
        <Tabs.Screen name="add" />
        <Tabs.Screen name="habits" />
        <Tabs.Screen name="more" />
      </Tabs>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Adicionar">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {QUICK.map((q) => (
            <Pressable
              key={q.label}
              accessibilityRole="button"
              accessibilityLabel={q.label}
              onPress={() => {
                setOpen(false);
                router.push(q.href as never);
              }}
              style={({ pressed }) => ({ width: '31.5%', flexGrow: 1, minWidth: 100, aspectRatio: 1.25, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: pressed ? colors.surface3 : colors.surface2, alignItems: 'center', justifyContent: 'center', gap: space.sm })}
            >
              <q.icon size={22} color={colors.silver} strokeWidth={1.7} />
              <Text variant="smallMedium" center>
                {q.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Sheet>
    </>
  );
}
