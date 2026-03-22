/**
 * OfflineBanner — a thin inline strip shown when the device has no network.
 *
 * Positioning: render this component at the TOP of a screen's content area,
 * directly below the navigation header. It is NOT absolutely positioned —
 * it participates in normal layout flow so it never overlaps buttons or text.
 *
 * Usage inside a screen:
 *
 *   import { OfflineBanner } from '../../components/ui/OfflineBanner';
 *
 *   return (
 *     <View style={{ flex: 1 }}>
 *       <OfflineBanner />          ← sits flush below the native/custom header
 *       <ScrollView>...</ScrollView>
 *     </View>
 *   );
 *
 * If you only need the boolean (e.g. to conditionally disable a button):
 *
 *   const isOffline = useIsOffline();
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, FONT_SIZE, FONT_WEIGHT, SPACING } from '../../constants/theme';

// ─── Shared Network Hook ──────────────────────────────────────────────────────

type NetworkState = { isConnected: boolean | null };
const ExpoNetwork = require('expo-network') as {
  getNetworkStateAsync: () => Promise<NetworkState>;
  addNetworkStateListener: (cb: (s: NetworkState) => void) => { remove: () => void };
};

/** Returns true while the device reports no network connection. */
export function useIsOffline(): boolean {
  const [isOffline, setIsOffline] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;

    ExpoNetwork.getNetworkStateAsync().then((state) => {
      if (mounted) setIsOffline(!state.isConnected);
    });

    const sub = ExpoNetwork.addNetworkStateListener((state) => {
      if (mounted) setIsOffline(!state.isConnected);
    });

    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return isOffline;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OfflineBanner() {
  const isOffline = useIsOffline();
  if (!isOffline) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.dot}>●</Text>
      <Text style={styles.text}>Offline Mode</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.danger,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.base,
  },
  dot: {
    color: COLORS.white,
    fontSize: 8,
    lineHeight: 14,
  },
  text: {
    color: COLORS.white,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.bold,
    letterSpacing: 0.3,
  },
});
