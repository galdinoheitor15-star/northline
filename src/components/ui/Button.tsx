import { ActivityIndicator, Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { colors, radius, space } from '@/theme/tokens';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
  variant?: Variant;
  icon?: LucideIcon;
  loading?: boolean;
  size?: 'md' | 'sm';
  full?: boolean;
  style?: StyleProp<ViewStyle>;
}

const bg: Record<Variant, string> = { primary: colors.silver, secondary: colors.surface3, ghost: 'transparent', danger: colors.negativeDim };
const fg: Record<Variant, string> = { primary: colors.onSilver, secondary: colors.text, ghost: colors.textMuted, danger: colors.negative };

export function Button({ label, variant = 'primary', icon: Icon, loading, size = 'md', full, disabled, style, ...rest }: ButtonProps) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      style={({ pressed }) => [
        {
          height: size === 'md' ? 48 : 36,
          paddingHorizontal: size === 'md' ? space.xl : space.md,
          borderRadius: radius.md,
          backgroundColor: bg[variant],
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderColor: colors.borderStrong,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: space.sm,
          opacity: inactive ? 0.5 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
          alignSelf: full ? 'stretch' : 'auto',
        },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg[variant]} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          {Icon && <Icon size={size === 'md' ? 18 : 16} color={fg[variant]} strokeWidth={2} />}
          <Text variant={size === 'md' ? 'bodyMedium' : 'smallMedium'} style={{ color: fg[variant] }}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function IconButton({ icon: Icon, label, onPress, tone = 'default', size = 40, badge }: { icon: LucideIcon; label: string; onPress?: () => void; tone?: 'default' | 'muted' | 'filled'; size?: number; badge?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tone === 'filled' ? colors.surface3 : pressed ? colors.surface2 : 'transparent',
        borderWidth: tone === 'filled' ? 1 : 0,
        borderColor: colors.border,
      })}
    >
      <Icon size={20} color={tone === 'muted' ? colors.textMuted : colors.text} strokeWidth={1.8} />
      {badge && <View style={{ position: 'absolute', top: 9, right: 10, width: 7, height: 7, borderRadius: 4, backgroundColor: colors.silver }} />}
    </Pressable>
  );
}
