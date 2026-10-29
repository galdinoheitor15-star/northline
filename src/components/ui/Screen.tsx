import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { colors, layout, space } from '@/theme/tokens';
import { Text } from './Text';
import { IconButton } from './Button';
import { ModeBanner } from '@/components/ModeBanner';

export function Header({ title, subtitle, back, right, large }: { title: string; subtitle?: string; back?: boolean; right?: ReactNode; large?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 52, paddingTop: space.xs }}>
      {back && (
        <IconButton
          icon={ChevronLeft}
          label="Voltar"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      )}
      <View style={{ flex: 1 }}>
        <Text variant={large ? 'title' : 'heading'} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {subtitle && (
          <Text variant="small" tone="muted" numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {right && <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>{right}</View>}
    </View>
  );
}

interface ScreenProps extends ScrollViewProps {
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  /** espaço extra no fim para não ficar atrás da barra de abas */
  tabBarSpace?: boolean;
}

/** Contêiner padrão: área segura, largura máxima em telas grandes e rolagem. */
export function Screen({ children, header, footer, scroll = true, tabBarSpace, contentContainerStyle, ...rest }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const inner = { width: '100%' as const, maxWidth: layout.maxWidth, alignSelf: 'center' as const, paddingHorizontal: layout.gutter };
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top, backgroundColor: colors.bg }}>
        <ModeBanner />
        {header && <View style={inner}>{header}</View>}
      </View>
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[inner, { paddingTop: space.sm, paddingBottom: (tabBarSpace ? 110 : space.xxxl) + insets.bottom, gap: space.lg }, contentContainerStyle]}
          {...rest}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
      {footer && (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg, paddingBottom: insets.bottom + space.sm, paddingTop: space.sm }}>
          <View style={inner}>{footer}</View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
