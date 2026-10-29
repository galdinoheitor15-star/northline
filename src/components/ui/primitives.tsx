import type { ReactNode } from 'react';
import { Platform, Pressable, Switch, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { colors, radius, space } from '@/theme/tokens';
import { Text } from './Text';
import { Button } from './Button';

/** Na web, um contêiner clicável com botões dentro não pode ser <button>; no nativo continua "button". */
export const containerRole = Platform.OS === 'web' ? undefined : ('button' as const);

export function Card({ children, style, onPress, padded = true, accessibilityLabel }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; padded?: boolean; accessibilityLabel?: string }) {
  const base: ViewStyle = { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: padded ? space.lg : 0 };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable accessibilityRole={containerRole} accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [base, { backgroundColor: pressed ? colors.surface2 : colors.surface }, style]}>
      {children}
    </Pressable>
  );
}

export function SectionHeader({ title, action, onAction, icon: Icon }: { title: string; action?: string; onAction?: () => void; icon?: LucideIcon }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        {Icon && <Icon size={16} color={colors.textMuted} strokeWidth={1.8} />}
        <Text variant="caption" tone="muted">
          {title}
        </Text>
      </View>
      {action && (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text variant="smallMedium" tone="silver">
            {action}
          </Text>
          <ChevronRight size={14} color={colors.silver} />
        </Pressable>
      )}
    </View>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  return <View style={{ height: 1, backgroundColor: colors.border, marginLeft: inset }} />;
}

export function Badge({ label, tone = 'default' }: { label: string; tone?: 'default' | 'positive' | 'negative' | 'warning' | 'outline' }) {
  const map = {
    default: { bg: colors.surface3, fg: colors.textMuted, border: 'transparent' },
    outline: { bg: 'transparent', fg: colors.textMuted, border: colors.borderStrong },
    positive: { bg: colors.positiveDim, fg: colors.positive, border: 'transparent' },
    negative: { bg: colors.negativeDim, fg: colors.negative, border: 'transparent' },
    warning: { bg: colors.warningDim, fg: colors.warning, border: 'transparent' },
  }[tone];
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: map.bg, borderWidth: 1, borderColor: map.border, alignSelf: 'flex-start' }}>
      <Text variant="smallMedium" style={{ color: map.fg, fontSize: 11, lineHeight: 14 }}>
        {label}
      </Text>
    </View>
  );
}

export function ProgressBar({ value, tone = 'silver', height = 6 }: { value: number; tone?: 'silver' | 'positive' | 'negative'; height?: number }) {
  const pct = Math.max(0, Math.min(1, value));
  const color = tone === 'positive' ? colors.positive : tone === 'negative' ? colors.negative : colors.silver;
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }} style={{ height, borderRadius: height, backgroundColor: colors.surface3, overflow: 'hidden' }}>
      <View style={{ width: `${pct * 100}%`, height, borderRadius: height, backgroundColor: color }} />
    </View>
  );
}

export function ProgressRing({ value, size = 56, stroke = 5, children }: { value: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surface3} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={pct >= 1 ? colors.positive : colors.silver}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - pct)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

export function Chip({ label, selected, onPress, icon: Icon, color }: { label: string; selected?: boolean; onPress?: () => void; icon?: LucideIcon; color?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: space.md,
        height: 34,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: selected ? colors.silver : colors.borderStrong,
        backgroundColor: selected ? colors.surface3 : pressed ? colors.surface2 : 'transparent',
      })}
    >
      {color && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />}
      {Icon && <Icon size={14} color={selected ? colors.text : colors.textMuted} />}
      <Text variant="smallMedium" tone={selected ? 'default' : 'muted'}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>{children}</View>;
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: radius.md, padding: 3, borderWidth: 1, borderColor: colors.border }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={{ flex: 1, height: 34, borderRadius: radius.sm + 1, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? colors.surface3 : 'transparent' }}
          >
            <Text variant="smallMedium" tone={active ? 'default' : 'muted'}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ListRow({ title, subtitle, icon: Icon, right, onPress, danger, chevron = !!onPress }: { title: string; subtitle?: string; icon?: LucideIcon; right?: ReactNode; onPress?: () => void; danger?: boolean; chevron?: boolean }) {
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} onPress={onPress} disabled={!onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg, backgroundColor: pressed ? colors.surface2 : 'transparent', minHeight: 52 })}>
      {Icon && (
        <View style={{ width: 32, height: 32, borderRadius: radius.sm, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={17} color={danger ? colors.negative : colors.silver} strokeWidth={1.8} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text variant="bodyMedium" tone={danger ? 'negative' : 'default'}>
          {title}
        </Text>
        {subtitle && (
          <Text variant="small" tone="muted">
            {subtitle}
          </Text>
        )}
      </View>
      {right}
      {chevron && <ChevronRight size={18} color={colors.textFaint} />}
    </Pressable>
  );
}

export function ToggleRow({ title, subtitle, value, onChange, icon }: { title: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void; icon?: LucideIcon }) {
  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      icon={icon}
      chevron={false}
      right={<Switch accessibilityLabel={title} value={value} onValueChange={onChange} trackColor={{ false: colors.surface3, true: colors.positive }} thumbColor={colors.text} />}
    />
  );
}

export function EmptyState({ icon: Icon, title, description, action, onAction }: { icon: LucideIcon; title: string; description?: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: space.xxl, paddingHorizontal: space.lg, gap: space.sm }}>
      <View style={{ width: 48, height: 48, borderRadius: radius.pill, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs }}>
        <Icon size={22} color={colors.textMuted} strokeWidth={1.6} />
      </View>
      <Text variant="bodyMedium" center>
        {title}
      </Text>
      {description && (
        <Text variant="small" tone="muted" center style={{ maxWidth: 300 }}>
          {description}
        </Text>
      )}
      {action && <Button label={action} size="sm" variant="secondary" onPress={onAction} style={{ marginTop: space.sm }} />}
    </View>
  );
}

export function Stat({ label, value, tone = 'default', hint }: { label: string; value: string; tone?: 'default' | 'positive' | 'negative' | 'muted'; hint?: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text variant="small" tone="muted">
        {label}
      </Text>
      <Text variant="heading" tone={tone} style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
      {hint && (
        <Text variant="small" tone="faint">
          {hint}
        </Text>
      )}
    </View>
  );
}

export function Row({ children, gap = space.md, style, wrap }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle>; wrap?: boolean }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
}

export function Stack({ children, gap = space.md, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ gap }, style]}>{children}</View>;
}

export function Group({ children }: { children: ReactNode }) {
  return <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>{children}</View>;
}
