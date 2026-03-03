import {
  View,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { COLORS, RADIUS, SHADOW, SPACING } from '../../constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type Elevation = 'flat' | 'sm' | 'md' | 'lg';

interface CardProps {
  children: React.ReactNode;
  /** Controls the drop shadow depth. Defaults to 'sm'. */
  elevation?: Elevation;
  /** Overrides the default internal padding (SPACING.base). */
  padding?: number;
  style?: StyleProp<ViewStyle>;
}

// ─── Token Maps ───────────────────────────────────────────────────────────────

const elevationStyles: Record<Elevation, object> = {
  flat: {},
  sm: SHADOW.sm,
  md: SHADOW.md,
  lg: SHADOW.lg,
};

// ─── Component ────────────────────────────────────────────────────────────────

export function Card({
  children,
  elevation = 'sm',
  padding = SPACING.base,
  style,
}: CardProps) {
  return (
    <View
      style={[
        styles.card,
        elevationStyles[elevation],
        { padding },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
});
