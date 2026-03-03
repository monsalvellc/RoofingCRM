import { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useUpdateUserProfile } from '../../hooks';
import { Button, Card, Typography } from '../../components/ui';
import { COLORS, FONT_SIZE, FONT_WEIGHT, SPACING } from '../../constants/theme';

// ─── Component ────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const { userProfile, logout } = useAuth();
  const { mutate: updateProfile } = useUpdateUserProfile();

  // Optimistic local state for the HD toggle so the switch reflects changes immediately
  const [hdEnabled, setHdEnabled] = useState(userProfile?.hdPhotosEnabled ?? false);

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleToggleHd = (newValue: boolean) => {
    setHdEnabled(newValue);
    updateProfile(
      { hdPhotosEnabled: newValue },
      { onError: () => setHdEnabled(!newValue) }, // revert on failure
    );
  };

  const handleSignOut = async () => {
    try {
      await logout();
      // _layout.tsx auth guard handles navigation after sign-out
    } catch {
      Alert.alert('Error', 'Failed to sign out. Please try again.');
    }
  };

  // ─── Derived data ─────────────────────────────────────────────────────────────

  const fullName =
    [userProfile?.firstName, userProfile?.lastName].filter(Boolean).join(' ') || '—';
  const email = userProfile?.email ?? '—';
  const role = userProfile?.role ?? '—';

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <Typography style={styles.title}>Settings</Typography>
      </View>

      <ScrollView contentContainerStyle={styles.body}>

        {/* ── Profile Card ── */}
        <Typography style={styles.sectionLabel}>Profile</Typography>
        <Card elevation="sm" style={styles.cardPadding}>
          <Row label="Name" value={fullName} />
          <View style={styles.divider} />
          <Row label="Email" value={email} />
          <View style={styles.divider} />
          <Row label="Role" value={role} />
        </Card>

        {/* ── Media Settings (feature-flag gated) ── */}
        {userProfile?.allowHdToggle === true && (
          <>
            <Typography style={styles.sectionLabel}>Media Settings</Typography>
            <Card elevation="sm" style={styles.cardPadding}>
              <View style={styles.row}>
                <Typography style={styles.hdLabel}>Enable HD Photo Uploads</Typography>
                <Switch
                  value={hdEnabled}
                  onValueChange={handleToggleHd}
                  trackColor={{ false: COLORS.border, true: COLORS.primaryLight }}
                  thumbColor={hdEnabled ? COLORS.primary : COLORS.textDisabled}
                />
              </View>
            </Card>
          </>
        )}

        {/* ── Sign Out ── */}
        <Button
          variant="primary"
          size="lg"
          label="Sign Out"
          onPress={handleSignOut}
          style={styles.signOutBtn}
        />

      </ScrollView>
    </View>
  );
}

// ─── Row Helper ───────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Typography style={styles.rowLabel}>{label}</Typography>
      <Typography style={styles.rowValue} numberOfLines={1}>{value}</Typography>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.primary,
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: FONT_WEIGHT.heavy,
    color: COLORS.white,
  },
  body: {
    padding: SPACING.lg,
    paddingBottom: 48,
  },

  sectionLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: SPACING.sm,
    marginTop: SPACING.lg,
    marginLeft: SPACING.xs,
  },

  cardPadding: {
    paddingHorizontal: SPACING.base,
    paddingVertical: 0,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  rowLabel: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textSecondary,
    width: 70,
  },
  rowValue: {
    fontSize: FONT_SIZE.base,
    color: COLORS.textPrimary,
    flex: 1,
    textAlign: 'right',
  },
  hdLabel: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textPrimary,
    flex: 1,
  },

  divider: {
    height: 1,
    backgroundColor: COLORS.divider,
  },

  signOutBtn: {
    marginTop: SPACING.xxl + SPACING.xs,
    backgroundColor: COLORS.danger,
    borderRadius: 12,
  },
});
