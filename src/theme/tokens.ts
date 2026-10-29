// Sistema de design do Northline: preto/carvão, superfícies em cinza, prata como acento.
// Verde discreto só para indicadores positivos; vermelho só para alertas e valores negativos.

export const colors = {
  bg: '#09090A',
  surface: '#111113',
  surface2: '#17171A',
  surface3: '#1E1E22',
  border: '#232327',
  borderStrong: '#303036',
  text: '#F2F2F3',
  textMuted: '#A0A0A8',
  textFaint: '#6B6B73',
  silver: '#C9CBD1',
  silverDim: '#8E9099',
  onSilver: '#0B0B0C',
  positive: '#4FB286',
  positiveDim: 'rgba(79,178,134,0.14)',
  negative: '#E5534B',
  negativeDim: 'rgba(229,83,75,0.14)',
  warning: '#D9A441',
  warningDim: 'rgba(217,164,65,0.14)',
  overlay: 'rgba(0,0,0,0.6)',
  category: {
    work: '#8EA2C8',
    study: '#AE9BD6',
    personal: '#A3AAB4',
    meeting: '#7EB1CF',
    health: '#7FC29B',
    other: '#8A8A93',
  },
} as const;

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 48 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;

export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const type = {
  display: { fontFamily: font.semibold, fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  title: { fontFamily: font.semibold, fontSize: 22, lineHeight: 28, letterSpacing: -0.3 },
  heading: { fontFamily: font.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 21 },
  bodyMedium: { fontFamily: font.medium, fontSize: 15, lineHeight: 21 },
  small: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
  smallMedium: { fontFamily: font.medium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: font.medium, fontSize: 11, lineHeight: 14, letterSpacing: 0.6, textTransform: 'uppercase' as const },
  number: { fontFamily: font.semibold, fontSize: 26, lineHeight: 30, letterSpacing: -0.5, fontVariant: ['tabular-nums' as const] },
} as const;

export const shadow = {
  card: { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
} as const;

export const motion = { fast: 140, base: 200 } as const;

export const layout = { maxWidth: 720, gutter: 16 } as const;
