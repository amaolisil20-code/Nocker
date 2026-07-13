export const theme = {
  colors: {
    bg: '#0A0A0A',
    surface: '#141414',
    surfaceElevated: '#1A1A1A',
    surfaceMuted: '#1F1F1F',
    primary: '#16A34A',
    primaryDark: '#15803D',
    primaryLight: '#86EFAC',
    primaryGlow: 'rgba(22,163,74,0.25)',
    expense: '#EF4444',
    expenseSoft: 'rgba(239,68,68,0.12)',
    success: '#16A34A',
    successSoft: 'rgba(22,163,74,0.12)',
    warning: '#F59E0B',
    info: '#3B82F6',
    text: '#FFFFFF',
    textSecondary: '#A3A3A3',
    textTertiary: '#737373',
    border: 'rgba(255,255,255,0.08)',
    borderStrong: 'rgba(255,255,255,0.14)',
  },
  radius: { sm: 12, md: 16, lg: 20, xl: 24, pill: 999 },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, '2xl': 24, '3xl': 32 },
  font: {
    h1: { fontSize: 32, fontWeight: '700' as const, letterSpacing: -0.8 },
    h2: { fontSize: 26, fontWeight: '700' as const, letterSpacing: -0.5 },
    h3: { fontSize: 20, fontWeight: '600' as const, letterSpacing: -0.3 },
    h4: { fontSize: 17, fontWeight: '600' as const },
    body: { fontSize: 15, fontWeight: '400' as const },
    small: { fontSize: 13, fontWeight: '400' as const },
    tiny: { fontSize: 11, fontWeight: '500' as const, letterSpacing: 0.5 },
  },
};

export const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
