import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '../../constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

// ─── Token Maps ───────────────────────────────────────────────────────────────

const variantStyles: Record<Variant, { container: object; text: object; indicator: string }> = {
  primary: {
    container: {
      backgroundColor: COLORS.primary,
      borderWidth: 0,
    },
    text: { color: COLORS.textInverse },
    indicator: COLORS.textInverse,
  },
  secondary: {
    container: {
      backgroundColor: COLORS.secondary,
      borderWidth: 0,
    },
    text: { color: COLORS.textInverse },
    indicator: COLORS.textInverse,
  },
  outline: {
    container: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: COLORS.primary,
    },
    text: { color: COLORS.primary },
    indicator: COLORS.primary,
  },
  ghost: {
    container: {
      backgroundColor: 'transparent',
      borderWidth: 0,
    },
    text: { color: COLORS.primary },
    indicator: COLORS.primary,
  },
};

const sizeStyles: Record<Size, { container: object; text: object }> = {
  sm: {
    container: {
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      borderRadius: RADIUS.md,
    },
    text: {
      fontSize: FONT_SIZE.sm,
      fontWeight: FONT_WEIGHT.semibold,
    },
  },
  md: {
    container: {
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.base,
      borderRadius: RADIUS.lg,
    },
    text: {
      fontSize: FONT_SIZE.md,
      fontWeight: FONT_WEIGHT.semibold,
    },
  },
  lg: {
    container: {
      paddingVertical: SPACING.base,
      paddingHorizontal: SPACING.xl,
      borderRadius: RADIUS.lg,
    },
    text: {
      fontSize: FONT_SIZE.base,
      fontWeight: FONT_WEIGHT.bold,
    },
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  style,
}: ButtonProps) {
  const isDisabled = disabled || isLoading;
  const { container, text, indicator } = variantStyles[variant];
  const { container: sizeContainer, text: sizeText } = sizeStyles[size];

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        container,
        sizeContainer,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: isLoading }}
    >
      {isLoading ? (
        <ActivityIndicator color={indicator} size="small" />
      ) : (
        <Text style={[styles.text, text, sizeText]}>{label}</Text>
      )}
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    minHeight: SPACING.xxxl,
  },
  text: {
    letterSpacing: 0.2,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.8,
  },
});
