/**
 * CompanyLogo — floating company branding mark.
 *
 * Renders the company logo in the top-right corner, just below the notch /
 * Dynamic Island. Returns null while loading, on error, or when no logoUrl.
 *
 * Placement: absolute-positioned — place at the BOTTOM of the JSX tree so it
 * renders above all siblings without fighting z-index stacking contexts.
 *
 *   <View style={{ flex: 1 }}>
 *     <YourScreenContent />
 *     <CompanyLogo />   ← always last
 *   </View>
 */

import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useGetCompany } from '../hooks/useUsers';

export function CompanyLogo() {
  const insets = useSafeAreaInsets();
  const { userProfile } = useAuth();
  const companyId = userProfile?.companyId ?? '';

  const { data: company } = useGetCompany(companyId);

  if (!company?.logoUrl) return null;

  return (
    <View style={[styles.container, { top: insets.top + 8 }]}>
      <Image

        source={{ uri: company?.logoUrl }} 
        style={styles.logo} 
        contentFit="contain"
        cachePolicy="memory-disk" 
        transition={200}
        
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 16,
    zIndex: 100,
    elevation: 10,
    // Subtle drop shadow so the logo lifts off the green header on iOS.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  logo: {
    width: 60,
    height: 60,
    borderRadius: 10,
  },
});
