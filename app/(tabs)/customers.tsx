import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { CompanyLogo } from '../../components/CompanyLogo';
import { useMergedAllCustomers } from '../../hooks/useMergedData';
import { Card, Typography } from '../../components/ui';
import { SyncBadge } from '../../components/ui/SyncBadge';
import { OfflineBanner } from '../../components/ui/OfflineBanner';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '../../constants/theme';
import type { Customer } from '../../types';

// ─── Component ────────────────────────────────────────────────────────────────

export default function CustomersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userProfile } = useAuth();
  const companyId = userProfile?.companyId ?? '';

  // ─── Server State ───────────────────────────────────────────────────────────
  const { data: allCustomers = [], isLoading, error } = useMergedAllCustomers(companyId);

  // ─── Local UI State ─────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');

  // ─── Derived Data ───────────────────────────────────────────────────────────

  // Sort newest-first, then apply smart search filter.
  const filteredCustomers = useMemo(() => {
    const sorted = [...allCustomers].sort(
      (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
    );

    if (!searchQuery.trim()) return sorted;

    const lowerQuery = searchQuery.trim().toLowerCase();
    const numericQuery = searchQuery.replace(/\D/g, '');

    return sorted.filter((c) => {
      const firstName = (c.firstName || '').toLowerCase();
      const lastName = (c.lastName || '').toLowerCase();
      const email = (c.email || '').toLowerCase();
      const address = (c.address || '').toLowerCase();
      const phone = (c.phone || '').replace(/\D/g, '');

      if (firstName.includes(lowerQuery)) return true;
      if (lastName.includes(lowerQuery)) return true;
      if (`${firstName} ${lastName}`.includes(lowerQuery)) return true;
      if (email.includes(lowerQuery)) return true;
      if (address.includes(lowerQuery)) return true;
      if (numericQuery.length > 0 && phone.includes(numericQuery)) return true;
      return false;
    });
  }, [allCustomers, searchQuery]);

  // ─── Loading & Error States ──────────────────────────────────────────────────

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Typography variant="body" color={COLORS.textMuted}>
          {error.message ?? 'Failed to load customers. Please try again.'}
        </Typography>
      </View>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>

      <OfflineBanner />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + SPACING.xl }]}>
        <Typography style={styles.title}>Customers Directory</Typography>
        <Typography style={styles.headerSubtitle}>
          {filteredCustomers.length} Total
        </Typography>
      </View>

      <View style={styles.mainContent}>

      {/* Search bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchInputWrapper}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search name, phone, address..."
            placeholderTextColor={COLORS.textDisabled}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} style={styles.clearBtn}>
              <Typography style={styles.clearBtnText}>✕</Typography>
            </Pressable>
          )}
        </View>
      </View>

      {/* Customer list */}
      {allCustomers.length === 0 ? (
        <View style={styles.empty}>
          <Typography style={styles.emptyText}>No customers yet.</Typography>
        </View>
      ) : filteredCustomers.length === 0 ? (
        <View style={styles.empty}>
          <Typography style={styles.emptyText}>No customers match your search.</Typography>
        </View>
      ) : (
        <FlatList
          data={filteredCustomers}
          keyExtractor={(item: Customer) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }: { item: Customer }) => (
            <Pressable onPress={() => router.push(`/customer/${item.id}`)}>
              <Card elevation="sm" style={styles.customerCard}>

                {/* Full name */}
                <Typography style={styles.customerName}>
                  {`${item.firstName || ''} ${item.lastName || ''}`.trim() || '—'}
                </Typography>
                {(item as any).isOfflineLead === true && (item as any)._localOnly === true && <SyncBadge />}

                {/* Phone + Email */}
                {(item.phone || item.email) ? (
                  <View style={styles.cardRow}>
                    {item.phone ? (
                      <Typography style={styles.cardMeta}>{item.phone}</Typography>
                    ) : null}
                    {item.phone && item.email ? (
                      <Typography style={styles.cardMetaDivider}>·</Typography>
                    ) : null}
                    {item.email ? (
                      <Typography style={styles.cardMeta} numberOfLines={1}>
                        {item.email}
                      </Typography>
                    ) : null}
                  </View>
                ) : null}

                {/* Address */}
                {item.address ? (
                  <Typography style={styles.cardAddress} numberOfLines={1}>
                    {item.address}
                  </Typography>
                ) : null}

              </Card>
            </Pressable>
          )}
        />
      )}

      </View>

      {/* Floats over all siblings; absolute-positioned at bottom of tree so it renders on top. */}
      <CompanyLogo />
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  headerSubtitle: {
    fontSize: FONT_SIZE.base,
    color: '#c8e6c9',
    marginTop: 4,
  },

  // Search row
  searchRow: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: FONT_SIZE.base,
    color: COLORS.textPrimary,
  },
  clearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  clearBtnText: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textMuted,
  },

  // Empty state
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: FONT_SIZE.base,
    color: COLORS.textMuted,
    textAlign: 'center',
  },

  // List
  list: {
    padding: SPACING.base,
    gap: SPACING.md,
    paddingBottom: 40,
  },

  // Customer card (layout overrides on top of Card component defaults)
  customerCard: {
    gap: SPACING.xs,
  },
  customerName: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  cardMeta: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
  },
  cardMetaDivider: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textDisabled,
  },
  cardAddress: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
    marginTop: 2,
  },
});
