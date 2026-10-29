import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { colors, layout, radius, space } from '@/theme/tokens';
import { Text } from './Text';
import { Button } from './Button';

/** Folha inferior simples (Modal nativo + animação de entrada curta). */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [anim] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (visible) Animated.timing(anim, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    else anim.setValue(0);
  }, [visible, anim]);
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityLabel="Fechar" onPress={onClose} style={{ flex: 1, backgroundColor: colors.overlay }} />
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: 'center',
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
          opacity: anim,
        }}
      >
        <View style={{ width: '100%', maxWidth: layout.maxWidth, backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderColor: colors.border, paddingBottom: insets.bottom + space.lg, paddingHorizontal: space.lg, paddingTop: space.sm }}>
          <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: space.md }} />
          {title && (
            <Text variant="heading" style={{ marginBottom: space.md }}>
              {title}
            </Text>
          )}
          {children}
        </View>
      </Animated.View>
    </Modal>
  );
}

// ---------- confirmação (Alert do RN não funciona com vários botões na web) ----------
interface ConfirmRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
  options?: { label: string; value: string; destructive?: boolean }[];
  resolve: (v: string | null) => void;
}
const useConfirmStore = create<{ req: ConfirmRequest | null; set: (r: ConfirmRequest | null) => void }>((set) => ({ req: null, set: (req) => set({ req }) }));

/** Pede confirmação. Retorna true/false. */
export function confirm(opts: { title: string; message?: string; confirmLabel?: string; destructive?: boolean }): Promise<boolean> {
  return new Promise((resolve) => useConfirmStore.getState().set({ ...opts, resolve: (v) => resolve(v === 'ok') }));
}

/** Pergunta com várias opções (ex.: "só esta ocorrência" / "toda a série"). Retorna o value ou null. */
export function choose(opts: { title: string; message?: string; options: { label: string; value: string; destructive?: boolean }[] }): Promise<string | null> {
  return new Promise((resolve) => useConfirmStore.getState().set({ ...opts, resolve }));
}

export function ConfirmHost() {
  const { req, set } = useConfirmStore();
  const done = (v: string | null) => {
    req?.resolve(v);
    set(null);
  };
  return (
    <Modal visible={!!req} transparent animationType="fade" onRequestClose={() => done(null)}>
      <View style={{ flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: space.xl }}>
        <View accessibilityRole="alert" style={{ width: '100%', maxWidth: 380, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.xl, gap: space.md }}>
          <Text variant="heading">{req?.title}</Text>
          {req?.message && (
            <Text variant="body" tone="muted">
              {req.message}
            </Text>
          )}
          <View style={{ gap: space.sm, marginTop: space.sm }}>
            {req?.options ? (
              req.options.map((o) => <Button key={o.value} label={o.label} variant={o.destructive ? 'danger' : 'secondary'} onPress={() => done(o.value)} />)
            ) : (
              <Button label={req?.confirmLabel ?? 'Confirmar'} variant={req?.destructive ? 'danger' : 'primary'} onPress={() => done('ok')} />
            )}
            <Button label="Cancelar" variant="ghost" onPress={() => done(null)} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ---------- toasts ----------
interface Toast {
  id: number;
  message: string;
  tone: 'default' | 'positive' | 'negative';
}
const useToastStore = create<{ toasts: Toast[]; push: (t: Omit<Toast, 'id'>) => void; drop: (id: number) => void }>((set) => ({
  toasts: [],
  push: (t) => {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts.slice(-2), { ...t, id }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 3500);
  },
  drop: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export const toast = {
  show: (message: string) => useToastStore.getState().push({ message, tone: 'default' }),
  success: (message: string) => useToastStore.getState().push({ message, tone: 'positive' }),
  error: (message: string) => useToastStore.getState().push({ message, tone: 'negative' }),
};

export function ToastHost() {
  const { toasts, drop } = useToastStore();
  const insets = useSafeAreaInsets();
  if (!toasts.length) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + space.sm, left: 0, right: 0, alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg }}>
      {toasts.map((t) => (
        <Pressable
          key={t.id}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          onPress={() => drop(t.id)}
          style={{ maxWidth: 480, width: '100%', backgroundColor: colors.surface3, borderRadius: radius.md, borderWidth: 1, borderColor: t.tone === 'negative' ? colors.negative : t.tone === 'positive' ? colors.positive : colors.borderStrong, paddingVertical: space.md, paddingHorizontal: space.lg }}
        >
          <Text variant="smallMedium" tone={t.tone === 'negative' ? 'negative' : 'default'}>
            {t.message}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
