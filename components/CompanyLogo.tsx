/**
 * CompanyLogo — floating company branding mark.
 *
 * Renders the company's logo from Firestore in the top-right corner of
 * whichever screen it is placed inside. Returns null gracefully while
 * loading, on error, or when no logoUrl is stored.
 *
 * Usage (place as a sibling of the main screen content, inside SafeAreaView):
 *   <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
 *     <CompanyLogo />
 *     <YourScreenContent />
 *   </SafeAreaView>
 *
 * The logo is position: 'absolute' so it floats over the header without
 * affecting the layout of any other element.
 */

import { StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useGetCompany } from '../hooks/useUsers';

export function CompanyLogo() {
  const insets = useSafeAreaInsets();
  const { userProfile } = useAuth();
  const companyId = userProfile?.companyId ?? '';

  // useGetCompany is already enabled-guarded: skips the query when companyId is empty.
  // React Query caches the result, so placing this on multiple screens is zero-cost
  // after the first fetch.
  const { data: company } = useGetCompany(companyId);

  // Nothing to render until the URL is confirmed non-empty.
  if (!company?.logoUrl) return null;

  return (
    <Image
      source={{ uri: company.logoUrl }}
      style={[styles.logo, { top: insets.top + 16 }]}
      contentFit="contain"
      // memory-disk: serves from in-memory cache on repeated renders; falls back
      // to disk so the logo never re-fetches on tab switches.
      cachePolicy="memory-disk"
      // Accessibility: treat as decorative — the company name is visible elsewhere.
      accessibilityIgnoresInvertColors
    />
  );
}

const styles = StyleSheet.create({
  logo: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 8,
    zIndex: 100,
    elevation: 10,
  },
});
