import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  InteractionManager,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
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
  useUpdateCustomer,
} from '../../hooks';
import { Button, Card, Typography } from '../../components/ui';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '../../constants/theme';
import type { Customer } from '../../types/customer';

// ─── Phone mask ───────────────────────────────────────────────────────────────
// Formats a raw digit string into (XXX) XXX-XXXX as the user types.

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits.length ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CustomerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userProfile } = useAuth();
  const companyId = userProfile?.companyId ?? '';

  // ─── Server State ───────────────────────────────────────────────────────────

  const { data: customer, isLoading, error } = useGetCustomer(id ?? '');
  const { data: companyUsers = [] } = useGetCompanyUsers(companyId);
  const { mutate: assignReps, isPending: isAssigning } = useAssignCustomerReps();
  const { mutate: updateCustomerMutate, isPending: isSaving } = useUpdateCustomer();

  // ─── Local UI State — Assign Modal ──────────────────────────────────────────

  const [isAssignModalVisible, setIsAssignModalVisible] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [repSearchQuery, setRepSearchQuery] = useState('');

  // ─── Local UI State — Edit Modal ─────────────────────────────────────────────

  const [isEditModalVisible, setIsEditModalVisible] = useState(false);

  // editForm mirrors every editable Customer field. Seeded fresh each time the
  // modal opens so discarded edits never bleed into a subsequent open.
  const [editForm, setEditForm] = useState<{
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    address: string;
    alternateAddress: string;
    leadSource: string;
    notes: string;
  }>({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    address: '',
    alternateAddress: '',
    leadSource: '',
    notes: '',
  });

  // Defers rendering the full profile content until the navigation transition
  // has settled. The Stack.Screen header still shows the title immediately.
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setIsReady(true));
    return () => task.cancel();
  }, []);

  // ─── Loading & Error States ──────────────────────────────────────────────────

  if (isLoading && !customer) {
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

  // ─── Role-Based Access ───────────────────────────────────────────────────────
  // Only SuperAdmin and Sales may edit customer fields.

  const canEdit =
    userProfile?.role === 'SuperAdmin' || userProfile?.role === 'Sales';

  // ─── Derived Data ────────────────────────────────────────────────────────────

  const fullName = `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || '—';
  const assignedUserIds: string[] = customer.assignedUserIds ?? [];
  const assignmentHistory: string[] = customer.assignmentHistory ?? [];
  const jobHistory: string[] = customer.jobHistory ?? [];

  // ─── Handlers — Edit Customer ────────────────────────────────────────────────

  /** Opens the edit modal pre-populated with the customer's current values. */
  const handleOpenEdit = () => {
    setEditForm({
      firstName: customer.firstName ?? '',
      lastName: customer.lastName ?? '',
      phone: customer.phone ?? '',
      email: customer.email ?? '',
      address: customer.address ?? '',
      alternateAddress: customer.alternateAddress ?? '',
      leadSource: customer.leadSource ?? '',
      notes: customer.notes ?? '',
    });
    setIsEditModalVisible(true);
  };

  /** Validates, builds a history entry, and writes the update to Firestore. */
  const handleSaveEdit = () => {
    const firstName = editForm.firstName.trim();
    const lastName = editForm.lastName.trim();
    const address = editForm.address.trim();

    // First name, last name, and address are required.
    if (!firstName || !lastName) {
      Alert.alert('Required', 'First and last name cannot be empty.');
      return;
    }
    if (!address) {
      Alert.alert('Required', 'Address cannot be empty.');
      return;
    }

    // Build actor info from the logged-in user for history and audit logging.
    const actorName =
      `${userProfile?.firstName ?? ''} ${userProfile?.lastName ?? ''}`.trim() || 'User';
    const actor = userProfile
      ? { id: userProfile.id, name: actorName, companyId: userProfile.companyId }
      : undefined;

    const date = new Date().toLocaleDateString();
    const customerFullName = `${firstName} ${lastName}`.trim();

    // History entry format matches the job history convention:
    // "[Actor] updated [CustomerName] customer details on MM/DD/YYYY"
    const historyEntry = `${actorName} updated ${customerFullName}'s customer details on ${date}`;

    // Strip empty optional strings to undefined so Firestore doesn't store
    // blank strings — this keeps query results clean.
    const updates: Partial<Customer> = {
      firstName,
      lastName,
      address,
      phone: editForm.phone.trim() || undefined,
      email: editForm.email.trim() || undefined,
      alternateAddress: editForm.alternateAddress.trim() || undefined,
      leadSource: editForm.leadSource.trim() || undefined,
      notes: editForm.notes.trim() || undefined,
    };

    updateCustomerMutate(
      { id: id!, data: updates, actor, historyEntry },
      {
        onSuccess: () => setIsEditModalVisible(false),
        onError: () => Alert.alert('Error', 'Could not save changes. Please try again.'),
      },
    );
  };

  // ─── Handlers — Unhide ──────────────────────────────────────────────────────

  /** Restores a hidden customer to full visibility in the pipeline. */
  const handleUnhide = () => {
    updateCustomerMutate(
      { id: id!, data: { isHidden: false } },
      { onError: () => Alert.alert('Error', 'Could not unhide customer. Please try again.') },
    );
  };

  // ─── Handlers — Assign Reps ─────────────────────────────────────────────────

  const handleOpenAssignModal = () => {
    setSelectedUserIds(customer.assignedUserIds ?? []);
    setRepSearchQuery('');
    setIsAssignModalVisible(true);
  };

  const filteredUsers = repSearchQuery.trim()
    ? companyUsers.filter((u) =>
        u.name.toLowerCase().includes(repSearchQuery.trim().toLowerCase()),
      )
    : companyUsers;

  const handleSaveAssignments = () => {
    const prevIds: string[] = customer.assignedUserIds ?? [];
    const addedIds = selectedUserIds.filter((uid) => !prevIds.includes(uid));
    const removedIds = prevIds.filter((uid) => !selectedUserIds.includes(uid));

    // No changes — just close without a write.
    if (addedIds.length === 0 && removedIds.length === 0) {
      setIsAssignModalVisible(false);
      return;
    }

    const toName = (uid: string) => companyUsers.find((u) => u.id === uid)?.name || uid;
    const addedNames = addedIds.map(toName);
    const removedNames = removedIds.map(toName);
    const actor = userProfile?.firstName || 'User';
    const date = new Date().toLocaleDateString();

    // Compose a human-readable assignment history entry.
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

  if (!isReady) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: 'Customer Profile', headerBackTitle: 'Back' }} />
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <Stack.Screen options={{ title: 'Customer Profile', headerBackTitle: 'Back' }} />

      {/* ── Unhide Banner — only visible when customer is hidden ── */}
      {customer.isHidden && (
        <Pressable
          style={styles.unhideBanner}
          onPress={handleUnhide}
          disabled={isSaving}
        >
          <Typography style={styles.unhideBannerText}>
            {isSaving ? 'Restoring...' : 'Unhide ⚠'}
          </Typography>
        </Pressable>
      )}

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
                  <Typography style={styles.chipText}>{found?.name ?? 'Unknown'}</Typography>
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
        {/* Show Edit button only for SuperAdmin and Sales */}
        <View style={styles.cardHeader}>
          <Typography style={styles.cardTitle}>Contact</Typography>
          {canEdit && (
            <Button
              variant="ghost"
              size="sm"
              label="✏️ Edit"
              onPress={handleOpenEdit}
              style={styles.manageBtn}
            />
          )}
        </View>
        <Typography style={styles.nameText}>{fullName}</Typography>
        {/* Phone — tap to open the dialer */}
        <Field
          label="Phone"
          value={customer.phone}
          onPress={
            customer.phone
              ? () => Linking.openURL(`tel:${customer.phone!.replace(/\D/g, '')}`)
              : undefined
          }
        />
        <Field label="Email" value={customer.email} />
      </Card>

      {/* ── Location ── */}
      <Card elevation="sm" style={styles.cardGap}>
        <Typography style={styles.cardTitle}>Location</Typography>
        {/* Address — tap to open the maps app for navigation */}
        <Field
          label="Address"
          value={customer.address}
          onPress={
            customer.address
              ? () => {
                  const encoded = encodeURIComponent(customer.address);
                  const url = Platform.OS === 'ios'
                    ? `maps:0,0?q=${encoded}`
                    : `geo:0,0?q=${encoded}`;
                  Linking.openURL(url);
                }
              : undefined
          }
        />
        <Field
          label="Alternate Address"
          value={customer.alternateAddress}
          onPress={
            customer.alternateAddress
              ? () => {
                  const encoded = encodeURIComponent(customer.alternateAddress!);
                  const url = Platform.OS === 'ios'
                    ? `maps:0,0?q=${encoded}`
                    : `geo:0,0?q=${encoded}`;
                  Linking.openURL(url);
                }
              : undefined
          }
        />
      </Card>

      {/* ── Details ── */}
      <Card elevation="sm" style={styles.cardGap}>
        <Typography style={styles.cardTitle}>Details</Typography>
        <Field label="Lead Source" value={customer.leadSource} />
        <Field label="Notes" value={customer.notes} />
      </Card>

      {/* ── Assignment History — immutable, system-written ── */}
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

      {/* ── Job History — newest first, written by job and customer mutations ── */}
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

      {/* ══════════════════════════════════════════════════════════════════════
          EDIT CUSTOMER MODAL
          Accessible to SuperAdmin and Sales only (guarded by canEdit above).
          All 8 editable customer fields are presented in logical sections.
      ══════════════════════════════════════════════════════════════════════ */}
      <Modal
        visible={isEditModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.editModalOuter}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Header */}
          <View style={styles.editModalHeader}>
            <Typography style={styles.editModalTitle}>Edit Customer</Typography>
            <Pressable
              onPress={() => setIsEditModalVisible(false)}
              hitSlop={12}
              style={styles.editModalClose}
            >
              <Ionicons name="close" size={24} color={COLORS.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.editModalScroll}
            contentContainerStyle={styles.editModalContent}
            keyboardShouldPersistTaps="handled"
          >

            {/* ── Contact Section ── */}
            <Typography style={styles.editSectionLabel}>Contact</Typography>

            <EditField label="First Name *">
              <TextInput
                style={styles.editInput}
                value={editForm.firstName}
                onChangeText={(v) => setEditForm((f) => ({ ...f, firstName: v }))}
                placeholder="First name"
                placeholderTextColor={COLORS.textDisabled}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </EditField>

            <EditField label="Last Name *">
              <TextInput
                style={styles.editInput}
                value={editForm.lastName}
                onChangeText={(v) => setEditForm((f) => ({ ...f, lastName: v }))}
                placeholder="Last name"
                placeholderTextColor={COLORS.textDisabled}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </EditField>

            <EditField label="Phone">
              <TextInput
                style={styles.editInput}
                value={editForm.phone}
                onChangeText={(v) => setEditForm((f) => ({ ...f, phone: formatPhone(v) }))}
                placeholder="(555) 000-0000"
                placeholderTextColor={COLORS.textDisabled}
                keyboardType="phone-pad"
              />
            </EditField>

            <EditField label="Email">
              <TextInput
                style={styles.editInput}
                value={editForm.email}
                onChangeText={(v) => setEditForm((f) => ({ ...f, email: v }))}
                placeholder="email@example.com"
                placeholderTextColor={COLORS.textDisabled}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </EditField>

            {/* ── Location Section ── */}
            <Typography style={[styles.editSectionLabel, styles.editSectionLabelSpaced]}>
              Location
            </Typography>

            <EditField label="Address *">
              <TextInput
                style={styles.editInput}
                value={editForm.address}
                onChangeText={(v) => setEditForm((f) => ({ ...f, address: v }))}
                placeholder="Street address"
                placeholderTextColor={COLORS.textDisabled}
                autoCapitalize="words"
              />
            </EditField>

            <EditField label="Alternate Address">
              <TextInput
                style={styles.editInput}
                value={editForm.alternateAddress}
                onChangeText={(v) => setEditForm((f) => ({ ...f, alternateAddress: v }))}
                placeholder="Secondary address (optional)"
                placeholderTextColor={COLORS.textDisabled}
                autoCapitalize="words"
              />
            </EditField>

            {/* ── Details Section ── */}
            <Typography style={[styles.editSectionLabel, styles.editSectionLabelSpaced]}>
              Details
            </Typography>

            <EditField label="Lead Source">
              <TextInput
                style={styles.editInput}
                value={editForm.leadSource}
                onChangeText={(v) => setEditForm((f) => ({ ...f, leadSource: v }))}
                placeholder="e.g. Door Knock, Referral"
                placeholderTextColor={COLORS.textDisabled}
                autoCapitalize="words"
              />
            </EditField>

            <EditField label="Notes">
              <TextInput
                style={[styles.editInput, styles.editInputMultiline]}
                value={editForm.notes}
                onChangeText={(v) => setEditForm((f) => ({ ...f, notes: v }))}
                placeholder="Internal notes about this customer..."
                placeholderTextColor={COLORS.textDisabled}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                autoCapitalize="sentences"
              />
            </EditField>

            <Typography style={styles.editRequiredNote}>* Required fields</Typography>

          </ScrollView>

          {/* Save Button — pinned to the bottom above the keyboard */}
          <View style={styles.editModalFooter}>
            <Button
              variant="primary"
              size="lg"
              label={isSaving ? 'Saving...' : 'Save Changes'}
              onPress={handleSaveEdit}
              isLoading={isSaving}
              disabled={isSaving}
              style={styles.editSaveBtn}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════════
          ASSIGN REPS MODAL — unchanged from original implementation
      ══════════════════════════════════════════════════════════════════════ */}
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
              value={repSearchQuery}
              onChangeText={setRepSearchQuery}
              autoCorrect={false}
              autoCapitalize="none"
            />

            {/* Rep list */}
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
              label={isAssigning ? 'Saving...' : 'Save Assignments'}
              onPress={handleSaveAssignments}
              isLoading={isAssigning}
              disabled={isAssigning}
              style={styles.saveBtn}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// ─── Field Display Helper ─────────────────────────────────────────────────────
// Read-only row. When `onPress` is provided the value renders as a tappable
// link (blue text) so users can dial a number or open the maps app.

function Field({
  label,
  value,
  onPress,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  const displayValue = value?.trim() || 'N/A';
  return (
    <View style={styles.fieldRow}>
      <Typography style={styles.fieldLabel}>{label}</Typography>
      {onPress && value?.trim() ? (
        <Pressable onPress={onPress} hitSlop={6}>
          <Typography style={[styles.fieldValue, styles.fieldLink]}>
            {displayValue}
          </Typography>
        </Pressable>
      ) : (
        <Typography style={styles.fieldValue}>{displayValue}</Typography>
      )}
    </View>
  );
}

// ─── Edit Field Wrapper ───────────────────────────────────────────────────────
// Renders a labelled container around any edit input inside the edit modal.

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.editFieldWrapper}>
      <Typography style={styles.editFieldLabel}>{label}</Typography>
      {children}
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

  // ── Unhide banner ───────────────────────────────────────────────────────────
  unhideBanner: {
    backgroundColor: '#FF4500',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.md,
  },
  unhideBannerText: {
    color: '#FFFFFF',
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.heavy,
    letterSpacing: 0.5,
  },

  // ── Profile cards ───────────────────────────────────────────────────────────
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

  // ── Name display ────────────────────────────────────────────────────────────
  nameText: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.heavy,
    color: COLORS.textPrimary,
    marginTop: -SPACING.xs,
  },

  // ── Field row (read-only) ───────────────────────────────────────────────────
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
  // Applied on top of fieldValue when the field is tappable
  fieldLink: {
    color: COLORS.primary,
    textDecorationLine: 'underline',
  },

  // ── Rep chips ───────────────────────────────────────────────────────────────
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

  // ── History entries ─────────────────────────────────────────────────────────
  historyText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },

  // ── Edit customer modal ─────────────────────────────────────────────────────
  editModalOuter: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  editModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
    backgroundColor: COLORS.surface,
  },
  editModalTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  editModalClose: {
    padding: 4,
  },
  editModalScroll: {
    flex: 1,
  },
  editModalContent: {
    padding: SPACING.lg,
    gap: SPACING.sm,
    paddingBottom: SPACING.xl,
  },

  // Section headers inside the edit modal
  editSectionLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  editSectionLabelSpaced: {
    marginTop: SPACING.lg,
  },

  // Individual field wrapper inside the edit modal
  editFieldWrapper: {
    gap: 4,
    marginBottom: SPACING.sm,
  },
  editFieldLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textSecondary,
  },
  editInput: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 11,
    fontSize: FONT_SIZE.base,
    color: COLORS.textPrimary,
  },
  editInputMultiline: {
    minHeight: 96,
    paddingTop: 11,
  },

  editRequiredNote: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textDisabled,
    marginTop: SPACING.sm,
  },

  editModalFooter: {
    padding: SPACING.base,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
    backgroundColor: COLORS.surface,
  },
  editSaveBtn: {
    borderRadius: RADIUS.lg,
  },

  // ── Assign reps modal ───────────────────────────────────────────────────────
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
