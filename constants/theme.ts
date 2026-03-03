// ─── Brand Colors ─────────────────────────────────────────────────────────────
export const COLORS = {
  // Primary (green — roofing/nature)
  primary: '#2e7d32',
  primaryLight: '#4caf50',
  primaryDark: '#1b5e20',
  primaryBg: '#f1f8e9',

  // Secondary (blue — trust/corporate)
  secondary: '#1976d2',
  secondaryLight: '#42a5f5',
  secondaryDark: '#1565c0',
  secondaryBg: '#e3f2fd',

  // Destructive / Warning
  danger: '#c62828',
  dangerLight: '#ef9a9a',
  warning: '#f57c00',
  warningBg: '#fff3e0',

  // Success
  success: '#2e7d32',
  successBg: '#e8f5e9',

  // Neutrals
  white: '#ffffff',
  background: '#f5f5f5',
  surface: '#ffffff',
  border: '#e0e0e0',
  borderLight: '#e8e8e8',
  divider: '#eeeeee',

  // Text
  textPrimary: '#1a1a1a',
  textSecondary: '#555555',
  textMuted: '#777777',
  textDisabled: '#bdbdbd',
  textInverse: '#ffffff',
} as const;

// ─── Typography ───────────────────────────────────────────────────────────────
export const FONT_SIZE = {
  xs: 11,
  sm: 12,
  md: 14,
  base: 15,
  lg: 16,
  xl: 18,
  xxl: 22,
  xxxl: 28,
} as const;

export const FONT_WEIGHT = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  heavy: '800' as const,
};

// ─── Spacing ──────────────────────────────────────────────────────────────────
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

// ─── Border Radius ────────────────────────────────────────────────────────────
export const RADIUS = {
  sm: 6,
  md: 8,
  lg: 10,
  xl: 14,
  round: 9999,
} as const;

// ─── Shadows ──────────────────────────────────────────────────────────────────
export const SHADOW = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 6,
  },
} as const;
