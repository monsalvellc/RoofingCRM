import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useQueryClient } from '@tanstack/react-query';
import { CompanyLogo } from '../../components/CompanyLogo';
import { useAuth } from '../../context/AuthContext';
import { usePreferences } from '../../context/PreferencesContext';
import { useUpdateUserProfile } from '../../hooks';
import { uploadCompanyLogo } from '../../services/firebase/companiesService';
import { Button, Card, Typography } from '../../components/ui';
import { COLORS, FONT_SIZE, FONT_WEIGHT, SPACING } from '../../constants/theme';

// ─── Component ────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userProfile, logout } = useAuth();
  const { mutate: updateProfile } = useUpdateUserProfile();
  const { showTopThreeJobs, toggleShowTopThreeJobs } = usePreferences();
  const queryClient = useQueryClient();

  // Optimistic local state for the HD toggle so the switch reflects changes immediately
  const [hdEnabled, setHdEnabled] = useState(userProfile?.hdPhotosEnabled ?? false);
  const [isUploading, setIsUploading] = useState(false);

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleToggleHd = (newValue: boolean) => {
    setHdEnabled(newValue);
    updateProfile(
      { hdPhotosEnabled: newValue },
      { onError: () => setHdEnabled(!newValue) }, // revert on failure
    );
  };

  const handlePickAndUploadLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (result.canceled || !result.assets?.[0]?.uri) return;

    const companyId = userProfile?.companyId ?? '';
    if (!companyId) return;

    setIsUploading(true);
    try {
      await uploadCompanyLogo(companyId, result.assets[0].uri);
      await queryClient.invalidateQueries({ queryKey: ['company', companyId] });
      Alert.alert('Success', 'Company logo updated.');
    } catch {
      Alert.alert('Error', 'Failed to upload logo. Please try again.');
    } finally {
      setIsUploading(false);
    }
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
      <View style={[styles.header, { paddingTop: insets.top + SPACING.xl }]}>
        <Typography style={styles.title}>Settings</Typography>
      </View>

      <View style={styles.mainContent}>
      <ScrollView contentContainerStyle={styles.body}>

        {/* ── Admin Controls (SuperAdmin only) ── */}
        {userProfile?.role === 'SuperAdmin' && (
          <>
            <Typography style={styles.sectionLabel}>Admin Controls</Typography>
            <Card elevation="sm" style={styles.cardPadding}>
              <Pressable style={styles.navRow} onPress={() => router.push('/manage-team')}>
                <Ionicons name="people" size={20} color={COLORS.primary} style={styles.navIcon} />
                <Typography style={styles.navLabel}>Manage Team & Seats</Typography>
                <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
              </Pressable>
            </Card>

            <Typography style={styles.sectionLabel}>Company Branding</Typography>
            <Card elevation="sm" style={styles.cardPadding}>
              <Pressable
                style={styles.navRow}
                onPress={handlePickAndUploadLogo}
                disabled={isUploading}
              >
                <Ionicons name="image-outline" size={20} color={COLORS.primary} style={styles.navIcon} />
                <Typography style={styles.navLabel}>Upload Company Logo</Typography>
                {isUploading
                  ? <ActivityIndicator size="small" color={COLORS.primary} />
                  : <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
                }
              </Pressable>
            </Card>
          </>
        )}

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

        {/* ── Dashboard Settings ── */}
        <Typography style={styles.sectionLabel}>Dashboard Settings</Typography>
        <Card elevation="sm" style={styles.cardPadding}>
          <View style={styles.row}>
            <Typography style={styles.hdLabel}>Show Top 3 Jobs Per Customer</Typography>
            <Switch
              value={showTopThreeJobs}
              onValueChange={toggleShowTopThreeJobs}
              trackColor={{ false: COLORS.border, true: COLORS.primaryLight }}
              thumbColor={showTopThreeJobs ? COLORS.primary : COLORS.textDisabled}
            />
          </View>
        </Card>

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

      {/* Floats over all siblings; absolute-positioned at bottom of tree so it renders on top. */}
      <CompanyLogo />
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
    backgroundColor: COLORS.primary,
  },
  mainContent: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  // Header — paddingTop reduced from 60; SafeAreaView now owns the status-bar inset.
  header: {
    backgroundColor: COLORS.primary,
    paddingTop: SPACING.base,
    paddingBottom: 24,
    paddingRight: 64,
    paddingLeft: 24,
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

  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  navIcon: {
    marginRight: SPACING.sm,
  },
  navLabel: {
    flex: 1,
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textPrimary,
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
