import {
  Text,
  StyleSheet,
  type StyleProp,
  type TextStyle,
  type TextProps,
} from 'react-native';
import { COLORS, FONT_SIZE, FONT_WEIGHT } from '../../constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type Variant = 'h1' | 'h2' | 'h3' | 'body' | 'caption' | 'label';
type Align = 'left' | 'center' | 'right';

interface TypographyProps extends Omit<TextProps, 'style'> {
  variant?: Variant;
  /** Overrides the variant's default color. Accepts any value from COLORS. */
  color?: string;
  align?: Align;
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
}

// ─── Token Map ────────────────────────────────────────────────────────────────

const variantStyles: Record<Variant, TextStyle> = {
  h1: {
    fontSize: FONT_SIZE.xxxl,
    fontWeight: FONT_WEIGHT.heavy,
    color: COLORS.textPrimary,
    lineHeight: FONT_SIZE.xxxl * 1.25,
  },
  h2: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
    lineHeight: FONT_SIZE.xxl * 1.25,
  },
  h3: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textPrimary,
    lineHeight: FONT_SIZE.xl * 1.3,
  },
  body: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.regular,
    color: COLORS.textSecondary,
    lineHeight: FONT_SIZE.base * 1.5,
  },
  caption: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.regular,
    color: COLORS.textMuted,
    lineHeight: FONT_SIZE.sm * 1.4,
  },
  label: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textPrimary,
    lineHeight: FONT_SIZE.md * 1.3,
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function Typography({
  variant = 'body',
  color,
  align = 'left',
  style,
  children,
  ...rest
}: TypographyProps) {
  return (
    <Text
      style={[
        variantStyles[variant],
        align !== 'left' && { textAlign: align },
        color ? { color } : null,
        style,
      ]}
      {...rest}
    >
      {children}
    </Text>
  );
}

// ─── Named re-exports for common shortcuts ────────────────────────────────────
// Usage: <Heading1>Title</Heading1> instead of <Typography variant="h1">

export const Heading1 = (props: Omit<TypographyProps, 'variant'>) => (
  <Typography variant="h1" {...props} />
);
export const Heading2 = (props: Omit<TypographyProps, 'variant'>) => (
  <Typography variant="h2" {...props} />
);
export const Heading3 = (props: Omit<TypographyProps, 'variant'>) => (
  <Typography variant="h3" {...props} />
);
export const Body = (props: Omit<TypographyProps, 'variant'>) => (
  <Typography variant="body" {...props} />
);
export const Caption = (props: Omit<TypographyProps, 'variant'>) => (
  <Typography variant="caption" {...props} />
);
export const Label = (props: Omit<TypographyProps, 'variant'>) => (
  <Typography variant="label" {...props} />
);

// ─── Styles ───────────────────────────────────────────────────────────────────
// StyleSheet is not used here since all styles are driven by the token map
// and composed inline. This avoids a large static object for rarely-combined
// variant+color+align combinations.
const _styles = StyleSheet.create({});
void _styles; // suppress unused-var lint
