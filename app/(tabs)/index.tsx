import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { usePreferences } from '../../context/PreferencesContext';
import { useGetAllJobs, useGetAllCustomers, useDeactivateCustomer } from '../../hooks';
import { Button, Card, Typography } from '../../components/ui';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '../../constants/theme';
import type { Job } from '../../types';

// ─── Screen constants ─────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  Lead: COLORS.secondary,
  Retail: '#0288d1',
  Inspected: '#7b1fa2',
  'Claim Filed': COLORS.warning,
  'Met with Adjuster': '#e65100',
  'Partial Approval': '#fbc02d',
  'Full Approval': '#388e3c',
  Production: '#6a1b9a',
  'Pending Payment': '#ff8f00',
  'Delinquent Payment': COLORS.danger,
  Completed: '#00838f',
};

const STATUS_FILTERS: Job['status'][] = [
  'Lead',
  'Retail',
  'Inspected',
  'Claim Filed',
  'Met with Adjuster',
  'Partial Approval',
  'Full Approval',
  'Production',
  'Pending Payment',
  'Delinquent Payment',
  'Completed',
];

const TYPE_FILTERS: Job['jobType'][] = ['Retail', 'Insurance'];

// ─── Pipeline Helpers ─────────────────────────────────────────────────────────

const safeParseTime = (date: any): number => {
  if (!date) return 0;

  // Case 1: Firestore Timestamp (object with seconds)
  if (typeof date === 'object' && 'seconds' in date) {
    return date.seconds * 1000;
  }
  
  // Case 2: Firestore Timestamp (method)
  if (typeof date === 'object' && typeof date.toMillis === 'function') {
    return date.toMillis();
  }

  // Case 3: Standard JavaScript Date Object (THE MISSING LINK)
  if (date instanceof Date) {
    return date.getTime();
  }

  // Case 4: ISO Strings (e.g. "2024-01-01T...")
  if (typeof date === 'string') {
    const millis = new Date(date).getTime();
    return isNaN(millis) ? 0 : millis;
  }

  // Case 5: Numbers
  if (typeof date === 'number') {
    return date;
  }

  return 0;
};
/**
 * Returns the single "rolled-up" status to display on a customer card.
 * Finds the first non-Completed job (newest-first); falls back to the newest
 * job's status if all are Completed, and to 'Lead' if the array is empty.
 */
function getDisplayStatus(customerJobs: Job[]): Job['status'] {
  if (!customerJobs.length) return 'Lead';
  const sorted = [...customerJobs].sort((a, b) => safeParseTime(b.createdAt) - safeParseTime(a.createdAt));
  return sorted.find((j) => j.status !== 'Completed')?.status ?? sorted[0].status;
}

/** Returns the Firestore ID of the active job (first non-Completed, newest-first). */
function getActiveJobId(customerJobs: Job[]): string {
  const sorted = [...customerJobs].sort((a, b) => safeParseTime(b.createdAt) - safeParseTime(a.createdAt));
  return sorted.find((j) => j.status !== 'Completed')?.id ?? sorted[0]?.id ?? '';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const router = useRouter();
  const { user, userProfile } = useAuth();
  const { showTopThreeJobs } = usePreferences();
  const companyId = userProfile?.companyId ?? '';

  // ─── Server State ───────────────────────────────────────────────────────────
  const { data: allJobs = [], isLoading, error } = useGetAllJobs(companyId);
  const { data: allCustomers = [] } = useGetAllCustomers(companyId);
  const { mutate: deactivateCustomerMutate } = useDeactivateCustomer();

  // ─── Local UI State ─────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<Job['status'] | null>(null);
  const [typeFilter, setTypeFilter] = useState<Job['jobType'] | null>(null);
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);

  // Pending selections — staged inside modal, committed on "Apply"
  const [pendingStatus, setPendingStatus] = useState<Job['status'] | null>(null);
  const [pendingType, setPendingType] = useState<Job['jobType'] | null>(null);

  // SuperAdmin view mode toggle
  const [viewMode, setViewMode] = useState<'personal' | 'unassigned' | 'company'>('personal');

  // ─── Derived Data ───────────────────────────────────────────────────────────

  // Sort newest-first, then apply view mode (client-side from all company jobs).
  const viewModeJobs = useMemo(() => {
    const sorted = [...allJobs].sort((a, b) => safeParseTime(b.createdAt) - safeParseTime(a.createdAt));
    if (viewMode === 'personal') {
      return sorted.filter((job) => job.assignedUserIds?.includes(user?.uid ?? ''));
    }
    if (viewMode === 'unassigned') {
      return sorted.filter(
        (job) => !job.assignedUserIds || job.assignedUserIds.length === 0,
      );
    }
    return sorted; // 'company' — all jobs
  }, [allJobs, viewMode, user?.uid]);

  // Group view-mode jobs by customer (one entry per customer, all their jobs inside).
  // Hidden customers are excluded from personal/unassigned views but visible in
  // the SuperAdmin "company" view so nothing is ever truly lost from oversight.
  const allCustomerGroups = useMemo(() => {
    // Build a lookup of hidden customer IDs — only applies outside company view.
    const hiddenIds =
      viewMode !== 'company'
        ? new Set(allCustomers.filter((c) => c.isHidden).map((c) => c.id))
        : new Set<string>();

    const map = new Map<string, { customerId: string; customerName: string; jobs: Job[]; isHidden: boolean }>();
    for (const job of viewModeJobs) {
      const cid = job.customerId;
      if (hiddenIds.has(cid)) continue; // skip hidden customers in personal/unassigned
      if (!map.has(cid)) {
        const customerDoc = allCustomers.find((c) => c.id === cid);
        map.set(cid, {
          customerId: cid,
          customerName: job.customerName ?? '',
          jobs: [],
          isHidden: customerDoc?.isHidden ?? false,
        });
      }
      map.get(cid)!.jobs.push(job);
    }
    // Sort groups by their newest job descending so the most-recent customer is first.
    return Array.from(map.values()).sort((a, b) => {
      const aNewest = Math.max(...a.jobs.map((j) => safeParseTime(j.createdAt)));
      const bNewest = Math.max(...b.jobs.map((j) => safeParseTime(j.createdAt)));
      return bNewest - aNewest;
    });
  }, [viewModeJobs, allCustomers, viewMode]);

  // Apply search + status + type filters to customer groups.
  const filteredCustomerGroups = useMemo(() => {
    let result = allCustomerGroups;

    if (searchQuery.trim()) {
      const lowerQuery = searchQuery.trim().toLowerCase();
      // Only strip to digits for phone matching if the query has NO alphabetic chars.
      // "336" → numericQuery="336", no letters → phone check runs.
      // "336pp" → has letters → phone check is skipped entirely.
      const queryHasLetters = /[a-z]/.test(lowerQuery);
      const numericQuery = lowerQuery.replace(/\D/g, '');

      // Build a fast O(1) customer lookup so we can read address fields.
      const customerMap = new Map(allCustomers.map((c) => [c.id, c]));

      result = result.filter((group) => {
        if (group.customerName.toLowerCase().includes(lowerQuery)) return true;

        // Address search against the Customer document (address isn't on Job).
        const customer = customerMap.get(group.customerId);
        const address = (customer?.address || '').toLowerCase();
        const altAddress = (customer?.alternateAddress || '').toLowerCase();
        if (address.includes(lowerQuery) || altAddress.includes(lowerQuery)) return true;

        return group.jobs.some((job) => {
          const jobPhone = (job.customerPhone || '').replace(/\D/g, '');
          const jName = (job.jobName || '').toLowerCase();
          const jId = (job.jobId || '').toLowerCase();
          const phoneMatch =
            !queryHasLetters && numericQuery.length > 0 && jobPhone.includes(numericQuery);
          return (
            jName.includes(lowerQuery) ||
            jId.includes(lowerQuery) ||
            phoneMatch
          );
        });
      });
    }

    if (statusFilter) {
      result = result.filter((group) => getDisplayStatus(group.jobs) === statusFilter);
    }
    if (typeFilter) {
      result = result.filter((group) => group.jobs.some((j) => j.jobType === typeFilter));
    }

    return result;
  }, [allCustomerGroups, allCustomers, searchQuery, statusFilter, typeFilter]);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const openFilterModal = () => {
    setPendingStatus(statusFilter);
    setPendingType(typeFilter);
    setIsFilterModalVisible(true);
  };

  const applyFilters = () => {
    setStatusFilter(pendingStatus);
    setTypeFilter(pendingType);
    setIsFilterModalVisible(false);
  };

  const handleLongPressCard = (customerId: string, customerName: string) => {
    // Only allow deactivation outside of the company view — in company view the
    // card is shown for oversight and long-press would be confusing.
    if (viewMode === 'company') return;

    const actorName = `${userProfile?.firstName ?? ''} ${userProfile?.lastName ?? ''}`.trim() || 'User';
    const actor = userProfile
      ? { id: userProfile.id, name: actorName, companyId: userProfile.companyId }
      : undefined;

    Alert.alert(
      'Hide Customer?',
      `"${customerName}" and all their jobs will be hidden from the pipeline. This does not delete any data.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Hide',
          style: 'destructive',
          onPress: () =>
            deactivateCustomerMutate(
              { id: customerId, actor },
              { onError: () => Alert.alert('Error', 'Could not hide customer. Please try again.') },
            ),
        },
      ],
    );
  };

  const clearFilters = () => {
    setPendingStatus(null);
    setPendingType(null);
    setStatusFilter(null);
    setTypeFilter(null);
    setIsFilterModalVisible(false);
  };


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
          {error.message ?? 'Failed to load jobs. Please try again.'}
        </Typography>
      </View>
    );
  }

  // ─── Derived display values ──────────────────────────────────────────────────

  const isFiltering = !!searchQuery.trim() || !!statusFilter || !!typeFilter;
  const activeFilterCount = (statusFilter ? 1 : 0) + (typeFilter ? 1 : 0);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <Typography style={styles.greeting}>
          Welcome, {userProfile?.firstName || 'User'}
        </Typography>
        <Typography style={styles.headerSubtitle}>
          {isFiltering
            ? `${filteredCustomerGroups.length} of ${allCustomerGroups.length}`
            : allCustomerGroups.length}{' '}
          Customers
        </Typography>
      </View>

      {/* View mode segmented control */}
      <View style={styles.segmentContainer}>
        <Pressable
          style={[styles.segmentBtn, viewMode === 'personal' && styles.segmentBtnActive]}
          onPress={() => setViewMode('personal')}
        >
          <Typography
            style={[styles.segmentText, viewMode === 'personal' && styles.segmentTextActive]}
          >
            My Jobs
          </Typography>
        </Pressable>
        <Pressable
          style={[styles.segmentBtn, viewMode === 'unassigned' && styles.segmentBtnActive]}
          onPress={() => setViewMode('unassigned')}
        >
          <Typography
            style={[styles.segmentText, viewMode === 'unassigned' && styles.segmentTextActive]}
          >
            Unassigned
          </Typography>
        </Pressable>
        {userProfile?.role === 'SuperAdmin' && (
          <Pressable
            style={[styles.segmentBtn, viewMode === 'company' && styles.segmentBtnActive]}
            onPress={() => setViewMode('company')}
          >
            <Typography
              style={[styles.segmentText, viewMode === 'company' && styles.segmentTextActive]}
            >
              Company
            </Typography>
          </Pressable>
        )}
      </View>

      {/* Search bar + Filter button */}
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
        <Pressable style={styles.filterButton} onPress={openFilterModal}>
          <Ionicons name="filter" size={20} color={COLORS.white} />
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Typography style={styles.filterBadgeText}>{activeFilterCount}</Typography>
            </View>
          )}
        </Pressable>
      </View>

      {/* Active filter summary pills */}
      {(statusFilter || typeFilter) && (
        <View style={styles.activeSummary}>
          {statusFilter && (
            <View
              style={[
                styles.activePill,
                { backgroundColor: STATUS_COLORS[statusFilter] ?? COLORS.primary },
              ]}
            >
              <Typography style={styles.activePillText}>{statusFilter}</Typography>
            </View>
          )}
          {typeFilter && (
            <View style={[styles.activePill, { backgroundColor: COLORS.primary }]}>
              <Typography style={styles.activePillText}>{typeFilter}</Typography>
            </View>
          )}
        </View>
      )}

      {/* Customer pipeline list */}
      {allCustomerGroups.length === 0 ? (
        <View style={styles.empty}>
          <Typography style={styles.emptyText}>No jobs yet. Tap + to add one.</Typography>
        </View>
      ) : filteredCustomerGroups.length === 0 ? (
        <View style={styles.empty}>
          <Typography style={styles.emptyText}>No customers match your search.</Typography>
        </View>
      ) : (
        <FlatList
          data={filteredCustomerGroups}
          keyExtractor={(item) => item.customerId}
          contentContainerStyle={styles.list}
          renderItem={({ item: group }) => {
            const displayStatus = getDisplayStatus(group.jobs);
            const statusColor = STATUS_COLORS[displayStatus] ?? '#999';
            const activeJobId = getActiveJobId(group.jobs);
            const jobLimit = showTopThreeJobs ? 3 : 1;
            const top3Jobs = [...group.jobs]
              .sort((a, b) => safeParseTime(b.createdAt) - safeParseTime(a.createdAt))
              .slice(0, jobLimit);

            const getJobColor = (job: Job): string => {
              if (job.status === 'Completed' && job.balance > 0 && job.completedAt) {
                if ((Date.now() - new Date(job.completedAt).getTime()) / 86400000 > 5) {
                  return '#FF5F1F';
                }
              }
              if (job.balance > 0) return COLORS.danger;
              if (job.status === 'Completed' && (job.balance ?? 0) === 0) return COLORS.primary;
              return COLORS.textMuted;
            };

            return (
              <Pressable
                onPress={() => router.push(`/job/${activeJobId}`)}
                onLongPress={() => handleLongPressCard(group.customerId, group.customerName)}
                delayLongPress={500}
              >
                <Card elevation="sm" style={[styles.jobCard, group.isHidden && styles.jobCardHidden]}>
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1, marginRight: SPACING.sm }}>
                      <Typography style={styles.leadName}>
                        {group.customerName || '—'}
                      </Typography>
                      <Typography style={styles.jobCountLabel}>
                        {group.isHidden ? '⚠ Hidden  ·  ' : ''}
                        {group.jobs.length} {group.jobs.length === 1 ? 'job' : 'jobs'}
                      </Typography>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                      <Typography style={styles.statusText}>{displayStatus}</Typography>
                    </View>
                  </View>
                  <View style={styles.cardBottom}>
                    <View style={styles.financialRow}>
                      <Typography style={styles.contractLabel}>Contracts:</Typography>
                      {top3Jobs.map((job) => (
                        <Typography key={job.id} style={[styles.jobAmount, { color: getJobColor(job) }]}>
                          ${(job.contractAmount || 0).toLocaleString()}
                        </Typography>
                      ))}
                    </View>
                  </View>
                </Card>
              </Pressable>
            );
          }}
        />
      )}

      {/* FAB */}
      <Pressable style={styles.fab} onPress={() => router.push('/add-lead')}>
        <Typography style={styles.fabText}>+</Typography>
      </Pressable>

      {/* ── Filter Modal ── */}
      <Modal
        visible={isFilterModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsFilterModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setIsFilterModalVisible(false)}
        >
          <Pressable style={styles.modalSheet} onPress={() => {}}>

            {/* Modal header */}
            <View style={styles.modalHeader}>
              <Typography style={styles.modalTitle}>Filter & Sort</Typography>
              <Pressable onPress={() => setIsFilterModalVisible(false)} hitSlop={12}>
                <Typography style={styles.modalCloseText}>✕</Typography>
              </Pressable>
            </View>

            {/* Pipeline Status */}
            <Typography style={styles.modalSectionLabel}>Pipeline Status</Typography>
            <View style={styles.modalChipWrap}>
              {STATUS_FILTERS.map((s) => {
                const active = pendingStatus === s;
                return (
                  <Pressable
                    key={s}
                    style={[
                      styles.modalChip,
                      active && { backgroundColor: STATUS_COLORS[s], borderColor: STATUS_COLORS[s] },
                    ]}
                    onPress={() => setPendingStatus(active ? null : s)}
                  >
                    <Typography
                      style={[styles.modalChipText, active && styles.modalChipTextActive]}
                    >
                      {s}
                    </Typography>
                  </Pressable>
                );
              })}
            </View>

            {/* Job Type */}
            <Typography style={styles.modalSectionLabel}>Job Type</Typography>
            <View style={styles.modalChipWrap}>
              {TYPE_FILTERS.map((t) => {
                const active = pendingType === t;
                return (
                  <Pressable
                    key={t}
                    style={[
                      styles.modalChip,
                      active && styles.modalChipActiveGreen,
                    ]}
                    onPress={() => setPendingType(active ? null : t)}
                  >
                    <Typography
                      style={[styles.modalChipText, active && styles.modalChipTextActive]}
                    >
                      {t}
                    </Typography>
                  </Pressable>
                );
              })}
            </View>

            {/* Actions */}
            <View style={styles.modalActions}>
              <Button
                variant="outline"
                label="Clear All"
                onPress={clearFilters}
                style={{ flex: 1 }}
              />
              <Button
                variant="primary"
                label="Apply"
                onPress={applyFilters}
                style={{ flex: 2 }}
              />
            </View>

          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Header
  header: {
    backgroundColor: COLORS.primary,
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  greeting: {
    fontSize: 26,
    fontWeight: FONT_WEIGHT.heavy,
    color: COLORS.white,
  },
  headerSubtitle: {
    fontSize: FONT_SIZE.base,
    color: '#c8e6c9',
    marginTop: 4,
  },

  // Segmented control
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.border,
    marginHorizontal: SPACING.base,
    marginTop: SPACING.md,
    marginBottom: 4,
    borderRadius: RADIUS.md,
    padding: 3,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    borderRadius: RADIUS.sm,
  },
  segmentBtnActive: {
    backgroundColor: COLORS.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentText: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textMuted,
  },
  segmentTextActive: {
    color: COLORS.primary,
  },

  // Search row
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 10,
  },
  searchInputWrapper: {
    flex: 1,
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
  filterButton: {
    width: 45,
    height: 45,
    borderRadius: 23,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FF5F1F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    fontSize: 11,
    fontWeight: FONT_WEIGHT.heavy,
    color: COLORS.white,
  },

  // Active filter pills
  activeSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    gap: 6,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  activePill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: RADIUS.md,
  },
  activePillText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.white,
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
    paddingBottom: 100,
  },

  // Job Card (overrides applied on top of Card component defaults)
  jobCard: {
    gap: SPACING.xs,
  },
  jobCardHidden: {
    opacity: 0.5,
    borderWidth: 1,
    borderColor: COLORS.danger,
    borderStyle: 'dashed',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  leadName: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
    flex: 1,
    marginRight: SPACING.sm,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.md,
  },
  statusText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.white,
  },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  financialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  jobAmount: {
    fontWeight: FONT_WEIGHT.semibold,
    fontSize: 13,
  },
  contractRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  contractLabel: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.md,
  },
  contractAmount: {
    fontWeight: FONT_WEIGHT.semibold,
    fontSize: FONT_SIZE.md,
  },
  cardDate: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
  },
  jobCountLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  // Footer hint
  hint: {
    textAlign: 'center',
    fontSize: FONT_SIZE.sm,
    color: COLORS.textDisabled,
    marginTop: SPACING.sm,
    paddingBottom: SPACING.base,
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  fabText: {
    fontSize: 32,
    fontWeight: FONT_WEIGHT.regular,
    color: COLORS.white,
    marginTop: -2,
  },

  // Filter Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: SPACING.lg,
    paddingBottom: 36,
    gap: SPACING.md,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  modalCloseText: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textSecondary,
  },
  modalSectionLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginTop: SPACING.sm,
  },
  modalChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  modalChip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  modalChipActiveGreen: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  modalChipText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textSecondary,
  },
  modalChipTextActive: {
    color: COLORS.white,
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.md,
  },
});
