import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput as RNTextInput,
  View,
  type StyleProp,
  type TextInputProps as RNTextInputProps,
  type ViewStyle,
} from 'react-native';
import {
  COLORS,
  FONT_SIZE,
  FONT_WEIGHT,
  RADIUS,
  SPACING,
} from '../../constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TextInputProps extends Omit<RNTextInputProps, 'secureTextEntry'> {
  /** Label rendered above the input field. */
  label?: string;
  /** Error message rendered below the input. Turns border and label red. */
  error?: string;
  /** Enables masked text with a show/hide toggle button. */
  secureTextEntry?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TextInput({
  label,
  error,
  secureTextEntry = false,
  containerStyle,
  onFocus,
  onBlur,
  ...rest
}: TextInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isTextHidden, setIsTextHidden] = useState(secureTextEntry);

  const hasError = !!error;

  // Derive border color from state priority: error > focused > default
  const borderColor = hasError
    ? COLORS.danger
    : isFocused
      ? COLORS.primary
      : COLORS.border;

  return (
    <View style={[styles.container, containerStyle]}>
      {/* Label */}
      {label ? (
        <Text style={[styles.label, hasError && styles.labelError]}>{label}</Text>
      ) : null}

      {/* Input row */}
      <View style={[styles.inputWrapper, { borderColor }]}>
        <RNTextInput
          style={styles.input}
          placeholderTextColor={COLORS.textDisabled}
          secureTextEntry={isTextHidden}
          onFocus={(e) => {
            setIsFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />

        {/* Show / hide toggle — only rendered when secureTextEntry is true */}
        {secureTextEntry ? (
          <Pressable
            onPress={() => setIsTextHidden((prev) => !prev)}
            style={styles.toggleBtn}
            accessibilityRole="button"
            accessibilityLabel={isTextHidden ? 'Show password' : 'Hide password'}
          >
            <Text style={styles.toggleText}>{isTextHidden ? 'Show' : 'Hide'}</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Error message */}
      {hasError ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : null}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: SPACING.xs,
  },

  // Label
  label: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  labelError: {
    color: COLORS.danger,
  },

  // Input row
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    minHeight: SPACING.xxxl + SPACING.sm, // 56px — comfortable tap target
  },
  input: {
    flex: 1,
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.regular,
    color: COLORS.textPrimary,
    paddingVertical: SPACING.md,
  },

  // Show/Hide toggle
  toggleBtn: {
    paddingLeft: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  toggleText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.secondary,
  },

  // Error message
  errorText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.danger,
    marginTop: SPACING.xs,
  },
});
