import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import {
  useGetCustomer,
  useGetCompanyUsers,
  useAssignCustomerReps,
} from '../../hooks';
import { Button, Card, Typography } from '../../components/ui';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '../../constants/theme';

// ─── Component ────────────────────────────────────────────────────────────────

export default function CustomerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userProfile } = useAuth();
  const companyId = userProfile?.companyId ?? '';

  // ─── Server State ───────────────────────────────────────────────────────────
  const { data: customer, isLoading, error } = useGetCustomer(id ?? '');
  const { data: companyUsers = [] } = useGetCompanyUsers(companyId);
  const { mutate: assignReps, isPending: isUpdating } = useAssignCustomerReps();

  // ─── Local UI State ─────────────────────────────────────────────────────────
  const [isAssignModalVisible, setIsAssignModalVisible] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // ─── Loading & Error States ──────────────────────────────────────────────────

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: 'Customer Profile', headerBackTitle: 'Back' }} />
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (error || !customer) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: 'Customer Profile', headerBackTitle: 'Back' }} />
        <Typography style={styles.notFoundText}>
          {error?.message ?? 'Customer not found.'}
        </Typography>
      </View>
    );
  }

  // ─── Derived Data ────────────────────────────────────────────────────────────

  const fullName = `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || '—';
  const assignedUserIds: string[] = customer.assignedUserIds ?? [];
  const assignmentHistory: string[] = customer.assignmentHistory ?? [];
  const jobHistory: string[] = (customer as any).jobHistory ?? [];

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleOpenAssignModal = () => {
    setSelectedUserIds(customer.assignedUserIds ?? []);
    setSearchQuery('');
    setIsAssignModalVisible(true);
  };

  const filteredUsers = searchQuery.trim()
    ? companyUsers.filter((u) =>
        u.name.toLowerCase().includes(searchQuery.trim().toLowerCase()),
      )
    : companyUsers;

  const handleSaveAssignments = () => {
    const prevIds: string[] = customer.assignedUserIds ?? [];
    const addedIds = selectedUserIds.filter((uid) => !prevIds.includes(uid));
    const removedIds = prevIds.filter((uid) => !selectedUserIds.includes(uid));

    // No changes — just close
    if (addedIds.length === 0 && removedIds.length === 0) {
      setIsAssignModalVisible(false);
      return;
    }

    const toName = (uid: string) => companyUsers.find((u) => u.id === uid)?.name || uid;
    const addedNames = addedIds.map(toName);
    const removedNames = removedIds.map(toName);
    const actor = userProfile?.firstName || 'User';
    const date = new Date().toLocaleDateString();

    let historyEntry: string;
    if (addedIds.length > 0 && removedIds.length > 0) {
      historyEntry = `${actor} added ${addedNames.join(', ')} and removed ${removedNames.join(', ')} on ${date}`;
    } else if (addedIds.length > 0) {
      historyEntry = `${actor} assigned this to ${addedNames.join(', ')} on ${date}`;
    } else {
      historyEntry = `${actor} removed ${removedNames.join(', ')} from this customer on ${date}`;
    }

    assignReps(
      { customerId: id!, selectedUserIds, historyEntry },
      {
        onSuccess: () => setIsAssignModalVisible(false),
        onError: () => Alert.alert('Error', 'Could not save assignments.'),
      },
    );
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <Stack.Screen options={{ title: 'Customer Profile', headerBackTitle: 'Back' }} />

      {/* ── Assigned Reps ── */}
      <Card elevation="sm" style={styles.cardGap}>
        <View style={styles.cardHeader}>
          <Typography style={styles.cardTitle}>Assigned Reps</Typography>
          <Button
            variant="outline"
            size="sm"
            label="Manage"
            onPress={handleOpenAssignModal}
            style={styles.manageBtn}
          />
        </View>
        {assignedUserIds.length > 0 ? (
          <View style={styles.chipsRow}>
            {assignedUserIds.map((uid) => {
              const found = companyUsers.find((u) => u.id === uid);
              return (
                <View key={uid} style={styles.chip}>
                  <Typography style={styles.chipText}>{found?.name ?? uid}</Typography>
                </View>
              );
            })}
          </View>
        ) : (
          <Typography style={styles.emptyValue}>Unassigned</Typography>
        )}
      </Card>

      {/* ── Contact ── */}
      <Card elevation="sm" style={styles.cardGap}>
        <Typography style={styles.cardTitle}>Contact</Typography>
        <Typography style={styles.nameText}>{fullName}</Typography>
        <Field label="Phone" value={customer.phone} />
        <Field label="Email" value={customer.email} />
      </Card>

      {/* ── Location ── */}
      <Card elevation="sm" style={styles.cardGap}>
        <Typography style={styles.cardTitle}>Location</Typography>
        <Field label="Address" value={customer.address} />
        <Field label="Alternate Address" value={customer.alternateAddress} />
      </Card>

      {/* ── Details ── */}
      <Card elevation="sm" style={styles.cardGap}>
        <Typography style={styles.cardTitle}>Details</Typography>
        <Field label="Lead Source" value={customer.leadSource} />
        <Field label="Notes" value={customer.notes} />
      </Card>

      {/* ── Assignment History ── */}
      <Card elevation="sm" style={styles.cardGap}>
        <Typography style={styles.cardTitle}>Assignment History</Typography>
        {assignmentHistory.length > 0 ? (
          assignmentHistory.map((entry, i) => (
            <Typography key={i} style={styles.historyText}>{entry}</Typography>
          ))
        ) : (
          <Typography style={styles.emptyValue}>No history.</Typography>
        )}
      </Card>

      {/* ── Job History ── */}
      <Card elevation="sm" style={styles.cardGap}>
        <Typography style={styles.cardTitle}>Job History</Typography>
        {jobHistory.length > 0 ? (
          [...jobHistory].reverse().map((entry, i) => (
            <Typography key={i} style={styles.historyText}>{entry}</Typography>
          ))
        ) : (
          <Typography style={styles.emptyValue}>No history.</Typography>
        )}
      </Card>

      {/* ── Assignment Modal ── */}
      <Modal
        visible={isAssignModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsAssignModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Typography style={styles.modalTitle}>Assign Reps</Typography>
              <Button
                variant="ghost"
                size="sm"
                label="✕"
                onPress={() => setIsAssignModalVisible(false)}
              />
            </View>

            {/* Search bar */}
            <TextInput
              style={styles.searchInput}
              placeholder="Search reps..."
              placeholderTextColor={COLORS.textDisabled}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCorrect={false}
              autoCapitalize="none"
            />

            {/* User list */}
            <FlatList
              data={filteredUsers}
              keyExtractor={(item) => item.id}
              style={styles.modalList}
              renderItem={({ item }) => {
                const isSelected = selectedUserIds.includes(item.id);
                return (
                  <Pressable
                    style={[styles.userRow, isSelected && styles.userRowSelected]}
                    onPress={() =>
                      setSelectedUserIds((prev) =>
                        prev.includes(item.id)
                          ? prev.filter((uid) => uid !== item.id)
                          : [...prev, item.id],
                      )
                    }
                  >
                    <Typography
                      style={[styles.userName, isSelected && styles.userNameSelected]}
                    >
                      {item.name}
                    </Typography>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                    )}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <Typography style={styles.emptyValue}>No users found.</Typography>
              }
            />

            {/* Footer */}
            <Button
              variant="primary"
              size="lg"
              label={isUpdating ? 'Saving...' : 'Save Assignments'}
              onPress={handleSaveAssignments}
              isLoading={isUpdating}
              disabled={isUpdating}
              style={styles.saveBtn}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// ─── Field Helper ─────────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.fieldRow}>
      <Typography style={styles.fieldLabel}>{label}</Typography>
      <Typography style={styles.fieldValue}>{value?.trim() || 'N/A'}</Typography>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    padding: SPACING.base,
    gap: SPACING.md,
    paddingBottom: 48,
  },

  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  notFoundText: {
    fontSize: FONT_SIZE.base,
    color: COLORS.textMuted,
  },

  // Card layout
  cardGap: {
    gap: SPACING.md,
    padding: SPACING.base,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  manageBtn: {
    borderRadius: RADIUS.md,
  },

  // Name
  nameText: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.heavy,
    color: COLORS.textPrimary,
    marginTop: -SPACING.xs,
  },

  // Field row
  fieldRow: {
    gap: 2,
  },
  fieldLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textDisabled,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  fieldValue: {
    fontSize: FONT_SIZE.base,
    color: COLORS.textPrimary,
  },

  // Rep chips
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  chip: {
    backgroundColor: COLORS.successBg,
    borderRadius: RADIUS.round,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  chipText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.primary,
  },

  emptyValue: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textDisabled,
    fontStyle: 'italic',
  },

  // History
  historyText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 36,
    maxHeight: '75%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.base,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  modalTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  searchInput: {
    marginHorizontal: SPACING.base,
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    fontSize: FONT_SIZE.base,
    color: COLORS.textPrimary,
  },
  modalList: {
    paddingHorizontal: SPACING.base,
    paddingTop: SPACING.sm,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: SPACING.base,
    borderRadius: RADIUS.lg,
    marginVertical: 3,
    backgroundColor: COLORS.background,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  userRowSelected: {
    backgroundColor: COLORS.successBg,
    borderColor: COLORS.primary,
  },
  userName: {
    fontSize: FONT_SIZE.base,
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHT.medium,
  },
  userNameSelected: {
    color: COLORS.primary,
    fontWeight: FONT_WEIGHT.bold,
  },
  saveBtn: {
    marginHorizontal: SPACING.base,
    marginTop: SPACING.base,
    borderRadius: RADIUS.lg,
  },
});
