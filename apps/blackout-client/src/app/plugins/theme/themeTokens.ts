export const colors = {
    forest: '#004D40',
    leaf: '#00796B',
    leafLight: '#26A69A',
    teal: '#00897B',
    moss: '#00695C',
    black: '#0D0D0D',
    surface: '#121212',
    surfaceRaised: '#1E1E1E',
    surfaceOverlay: '#252525',
    surfaceBright: '#2C2C2C',
    textPrimary: '#E8E8E8',
    textSecondary: '#9E9E9E',
    textMuted: '#666666',
    textInverse: '#0D0D0D',
    accent: '#FF6F00',
    accentWarm: '#FF8F00',
    encrypted: '#00BFA5',
    danger: '#EF5350',
    warning: '#FFA726',
    info: '#42A5F5',
    border: '#2A2A2A',
    borderLight: '#3A3A3A',
    borderFocus: '#00796B',
    messageSelf: '#123A36',
    messageOther: '#1E1E1E',
    mentionBg: 'rgba(0, 137, 123, 0.15)',
    unreadBadge: '#FF6F00',
} as const;

export const spacing = {
    xxs: 2,
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
    xxxl: 64,
} as const;

export const radii = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    full: 9999,
} as const;

export const typography = {
    display: { fontFamily: 'System', fontSize: 32, fontWeight: '700' as const, lineHeight: 40 },
    h1: { fontFamily: 'System', fontSize: 24, fontWeight: '700' as const, lineHeight: 32 },
    h2: { fontFamily: 'System', fontSize: 20, fontWeight: '600' as const, lineHeight: 28 },
    h3: { fontFamily: 'System', fontSize: 16, fontWeight: '600' as const, lineHeight: 24 },
    body: { fontFamily: 'System', fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
    bodySmall: { fontFamily: 'System', fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
    mono: { fontFamily: 'monospace', fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
    label: {
        fontFamily: 'System',
        fontSize: 12,
        fontWeight: '500' as const,
        lineHeight: 16,
        letterSpacing: 0.5,
    },
} as const;

export const motion = {
    fast: 150,
    normal: 250,
    slow: 400,
    spring: { damping: 20, stiffness: 300 },
} as const;

export type BlackoutColors = typeof colors;
export type BlackoutSpacing = typeof spacing;
