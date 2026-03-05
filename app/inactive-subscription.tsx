import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { Typography } from '../components/ui';
import { COLORS, FONT_SIZE, FONT_WEIGHT, SPACING } from '../constants/theme';

export default function InactiveSubscriptionScreen() {
  const { userProfile, logout } = useAuth();
  const isSuperAdmin = userProfile?.role === 'SuperAdmin';

  const handleSignOut = async () => {
    try {
      await logout();
    } catch {
      Alert.alert('Error', 'Failed to sign out. Please try again.');
    }
  };

  const handleManageBilling = () => {
    // TODO: Link to billing portal (Stripe Customer Portal, etc.)
    console.log('Manage Billing pressed');
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="warning" size={56} color={COLORS.warning} />
        </View>

        <Typography style={styles.title}>Subscription Inactive</Typography>

        <Typography style={styles.message}>
          {isSuperAdmin
            ? "Your company's subscription has expired. Please update your billing to restore access for your team."
            : "Your company's subscription is currently inactive. Please contact your administrator."}
        </Typography>

        {isSuperAdmin && (
          <Pressable style={styles.billingBtn} onPress={handleManageBilling}>
            <Typography style={styles.billingBtnText}>Manage Billing</Typography>
          </Pressable>
        )}

        <Pressable style={styles.signOutBtn} onPress={handleSignOut}>
          <Typography style={styles.signOutBtnText}>Sign Out</Typography>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  content: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: SPACING.lg,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#fff8e1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  title: {
    fontSize: FONT_SIZE.xxl ?? 24,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  message: {
    fontSize: FONT_SIZE.base,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  billingBtn: {
    width: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  billingBtnText: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.white,
  },
  signOutBtn: {
    width: '100%',
    backgroundColor: 'transparent',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  signOutBtnText: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textSecondary,
  },
});
