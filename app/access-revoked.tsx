import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { Typography } from '../components/ui';
import { COLORS, FONT_SIZE, FONT_WEIGHT, SPACING } from '../constants/theme';

export default function AccessRevokedScreen() {
  const { logout } = useAuth();

  const handleSignOut = async () => {
    try {
      await logout();
    } catch {
      Alert.alert('Error', 'Failed to sign out. Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="lock-closed" size={56} color={COLORS.error ?? '#d32f2f'} />
        </View>

        <Typography style={styles.title}>Access Revoked</Typography>

        <Typography style={styles.message}>
          Your access to this account has been removed by your administrator. Please contact them
          if you believe this is a mistake.
        </Typography>

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
    backgroundColor: '#ffebee',
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
  signOutBtn: {
    width: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  signOutBtnText: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.white,
  },
});
