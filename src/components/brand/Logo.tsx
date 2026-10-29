import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { View } from 'react-native';
import { colors, font } from '@/theme/tokens';
import { Text } from '@/components/ui/Text';

// Monograma geométrico: um N cuja haste direita termina numa seta para o norte.
export function LogoMark({ size = 32, framed = true }: { size?: number; framed?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="Northline">
      <Defs>
        <LinearGradient id="nl-silver" x1="10" y1="8" x2="54" y2="56" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#E6E7EA" />
          <Stop offset="1" stopColor="#9A9CA4" />
        </LinearGradient>
      </Defs>
      {framed && <Rect x="1" y="1" width="62" height="62" rx="15" fill="#0E0E10" stroke="#2C2C31" strokeWidth="2" />}
      <Path d="M14.5 50.5V19.5H20L41 44V19.5H38L43.75 12L49.5 19.5H46.5V50.5H41L20 26V50.5Z" fill="url(#nl-silver)" />
    </Svg>
  );
}

export function Wordmark({ size = 15 }: { size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <LogoMark size={size * 1.9} />
      <Text style={{ fontFamily: font.semibold, fontSize: size, letterSpacing: size * 0.28, color: colors.text }}>NORTHLINE</Text>
    </View>
  );
}
