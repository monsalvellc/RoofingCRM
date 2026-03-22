import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '../../constants/theme';

/**
 * SyncBadge — displayed on any card or detail screen for an entity whose
 * `isOfflineLead` flag is true, signalling it was created offline and is
 * pending a Firestore server sync.
 *
 * Usage:
 *   {item.isOfflineLead && <SyncBadge />}
 */
export function SyncBadge() {
  return (
    <View style={styles.badge}>
      <Text style={styles.dot}>●</Text>
      <Text style={styles.label}>Pending Sync</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: COLORS.warning,
    borderRadius: RADIUS.round,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    gap: 4,
    marginTop: SPACING.xs,
  },
  dot: {
    fontSize: 7,
    color: COLORS.warning,
    lineHeight: 14,
  },
  label: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.warning,
    letterSpacing: 0.3,
  },
});
