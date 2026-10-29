import { Text as RNText, type TextProps } from 'react-native';
import { colors, type as typeScale } from '@/theme/tokens';

type Variant = keyof typeof typeScale;
type Tone = 'default' | 'muted' | 'faint' | 'positive' | 'negative' | 'warning' | 'silver' | 'onSilver';

const toneColor: Record<Tone, string> = {
  default: colors.text,
  muted: colors.textMuted,
  faint: colors.textFaint,
  positive: colors.positive,
  negative: colors.negative,
  warning: colors.warning,
  silver: colors.silver,
  onSilver: colors.onSilver,
};

export interface AppTextProps extends TextProps {
  variant?: Variant;
  tone?: Tone;
  center?: boolean;
}

export function Text({ variant = 'body', tone = 'default', center, style, ...rest }: AppTextProps) {
  return <RNText {...rest} style={[typeScale[variant], { color: toneColor[tone] }, center && { textAlign: 'center' }, style]} />;
}
