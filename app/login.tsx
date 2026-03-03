import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { Button, TextInput, Typography } from '../components/ui';
import { COLORS, FONT_SIZE, FONT_WEIGHT, SPACING } from '../constants/theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function friendlyError(code: string): string {
  switch (code) {
    case 'auth/invalid-email':
      return 'That email address is not valid.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection.';
    default:
      return 'Sign in failed. Please try again.';
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async () => {
    if (isSubmitting) return;
    if (!email.trim() || !password.trim()) {
      setErrorMsg('Email and password are required.');
      return;
    }

    setErrorMsg('');
    setIsSubmitting(true);

    try {
      await login(email.trim(), password);
      // _layout.tsx nav guard redirects to '/' once user state is set
    } catch (e: any) {
      setErrorMsg(friendlyError(e.code));
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>

        {/* ── Branding ── */}
        <View style={styles.brand}>
          <Typography style={styles.brandMark}>⬡</Typography>
          <Typography style={styles.brandName}>RoofCRM</Typography>
          <Typography style={styles.brandTagline}>Field-to-close, in one place.</Typography>
        </View>

        {/* ── Form ── */}
        <View style={styles.form}>
          <TextInput
            label="Email"
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={(t) => { setEmail(t); setErrorMsg(''); }}
          />
          <TextInput
            label="Password"
            placeholder="••••••••"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            value={password}
            onChangeText={(t) => { setPassword(t); setErrorMsg(''); }}
            onSubmitEditing={handleLogin}
            returnKeyType="go"
          />

          {errorMsg ? (
            <Typography style={styles.errorText}>{errorMsg}</Typography>
          ) : null}

          <Button
            variant="primary"
            size="lg"
            label="Sign In"
            onPress={handleLogin}
            isLoading={isSubmitting}
            disabled={isSubmitting}
            style={styles.loginButton}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.xxl,
    paddingBottom: SPACING.xxxl,
  },

  // Branding
  brand: {
    alignItems: 'center',
    marginBottom: SPACING.xxxl,
  },
  brandMark: {
    fontSize: 56,
    color: COLORS.primary,
    lineHeight: 64,
  },
  brandName: {
    fontSize: 32,
    fontWeight: FONT_WEIGHT.heavy,
    color: COLORS.textPrimary,
    letterSpacing: 0.5,
  },
  brandTagline: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
  },

  // Form
  form: {
    gap: SPACING.base,
  },
  errorText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.danger,
    textAlign: 'center',
    fontWeight: FONT_WEIGHT.medium,
  },
  loginButton: {
    marginTop: SPACING.xs,
    borderRadius: 12,
  },
});
