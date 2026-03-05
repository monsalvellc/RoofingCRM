import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { PreferencesProvider } from '../context/PreferencesContext';
import { getCompany } from '../services';
import type { Company } from '../types';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is considered fresh for 2 minutes — prevents redundant refetches
      // when navigating between screens quickly.
      staleTime: 1000 * 60 * 2,
      // Keep unused cached data in memory for 10 minutes after a component
      // unmounts, so navigating back feels instant.
      gcTime: 1000 * 60 * 10,
      // Retry failed queries up to 2 times before surfacing the error to UI.
      retry: 2,
    },
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normalizes Firestore Timestamp, Date, or number to Unix milliseconds. */
function parsePeriodEnd(value: any): number {
  if (!value) return 0;
  if (typeof value === 'object' && 'seconds' in value) return value.seconds * 1000;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return 0;
}

/** Returns true if the company subscription permits app access. */
function isSubscriptionValid(company: { subscriptionStatus: string; currentPeriodEnd?: any }): boolean {
  const activeStatuses = ['active', 'trialing'];
  if (!activeStatuses.includes(company.subscriptionStatus)) return false;

  // Also block if the billing period has expired regardless of status field.
  const end = parsePeriodEnd(company.currentPeriodEnd);
  if (end > 0 && Date.now() > end) return false;

  return true;
}

// ─── Navigation Guard ─────────────────────────────────────────────────────────

function NavigationGuard() {
  const { user, userProfile, isLoading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  const companyId = userProfile?.companyId ?? '';

  // Bypass the global 2-minute staleTime so the billing guard always sees
  // the current subscription status, not a cached past_due value.
  const { data: company, isLoading: companyLoading } = useQuery<Company, Error>({
    queryKey: ['company-guard', companyId],
    queryFn: () => getCompany(companyId),
    enabled: !!companyId,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });

  useEffect(() => {
    if (isLoading) return;
    // Wait for company data once the user is authenticated.
    if (user && companyId && companyLoading) return;

    const inAuthGroup = segments[0] === 'login';
    const onInactiveScreen = segments[0] === 'inactive-subscription';
    const onAccessRevokedScreen = segments[0] === 'access-revoked';

    if (!user && !inAuthGroup) {
      router.replace('/login');
      return;
    }

    if (user && inAuthGroup) {
      router.replace('/(tabs)');
      return;
    }

    // Revoked users — redirect regardless of subscription status.
    if (user && userProfile?.isActive === false) {
      if (!onAccessRevokedScreen) router.replace('/access-revoked');
      return;
    }

    if (user && company) {
      const valid = isSubscriptionValid(company);
      if (!valid && !onInactiveScreen) {
        router.replace('/inactive-subscription');
      } else if (valid && onInactiveScreen) {
        // Subscription was re-activated — send them into the app.
        router.replace('/(tabs)');
      }
    }
  }, [user, userProfile, isLoading, company, companyLoading, segments]);

  // Show spinner while auth or company data is resolving.
  if (isLoading || (user && companyId && companyLoading)) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#2e7d32" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#2e7d32' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="inactive-subscription" options={{ headerShown: false }} />
      <Stack.Screen name="access-revoked" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <PreferencesProvider>
        <AuthProvider>
          <NavigationGuard />
        </AuthProvider>
      </PreferencesProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
});
