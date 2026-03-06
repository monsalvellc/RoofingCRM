import { useState, useEffect } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  TextInput,
  View,
  ActivityIndicator,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useGetCompany, useGetSalesReps, useCreateRep } from '../hooks';
import { checkUserByEmail, deactivateRep, magicReactivateRep, reactivateRep } from '../services';
import { Card, Typography } from '../components/ui';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '../constants/theme';
import type { SalesRep } from '../types';

// ─── Component ────────────────────────────────────────────────────────────────

export default function ManageTeamScreen() {
  const router = useRouter();
  const { userProfile, isLoading: authLoading } = useAuth();
  const companyId = userProfile?.companyId ?? '';

  // ─── Route Guard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (userProfile?.role !== 'SuperAdmin') {
      router.replace('/(tabs)');
    }
  }, [authLoading, userProfile]);

  const { data: company, isLoading: companyLoading } = useGetCompany(companyId);
  // Returns ALL reps (active + inactive) — filtering is done client-side.
  const { data: allReps = [], isLoading: repsLoading } = useGetSalesReps(companyId);
  const { mutateAsync: createRep, isPending: isCreating } = useCreateRep();
  const queryClient = useQueryClient();

  // ─── Add Rep Modal State ─────────────────────────────────────────────────────
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [newRepRole, setNewRepRole] = useState<'Sales' | 'Production'>('Sales');

  // ─── Toggle & Derived Lists ──────────────────────────────────────────────────
  const [showInactive, setShowInactive] = useState(false);

  const activeReps = allReps.filter((r) => r.isActive !== false);
  const displayedReps = showInactive
    ? allReps.filter((r) => r.isActive === false)
    : activeReps;

  // ─── Action Modal State ──────────────────────────────────────────────────────
  const [actionModalVisible, setActionModalVisible] = useState(false);
  const [selectedRep, setSelectedRep] = useState<SalesRep | null>(null);
  const [isActioning, setIsActioning] = useState(false);

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleOpenAddModal = () => {
    const allowedSeats = company?.allowedSeats ?? 0;
    if (activeReps.length >= allowedSeats) {
      Alert.alert('Seat Limit Reached', 'Please upgrade your plan to add more reps.');
      return;
    }
    setFirstName('');
    setLastName('');
    setEmail('');
    setNewRepRole('Sales');
    setAddModalVisible(true);
  };

  const handleAddRep = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();

    if (!trimmedFirst || !trimmedLast || !trimmedEmail) {
      Alert.alert('Missing Fields', 'Please fill in all fields.');
      return;
    }

    try {
      // ── Check if email already exists in Firestore ──
      const existingUser = await checkUserByEmail(trimmedEmail);

      if (existingUser) {
        // Scenario A: already active — block creation.
        if (existingUser.isActive !== false) {
          Alert.alert('Error', 'A team member with this email is already active.');
          return;
        }

        // Scenario B: inactive — attempt magic reactivation.
        const allowedSeats = company?.allowedSeats ?? 0;
        if (activeReps.length >= allowedSeats) {
          Alert.alert(
            'Seat Limit Reached',
            'Cannot reactivate this user. You must upgrade your plan or revoke access from another member first.',
          );
          return;
        }

        await magicReactivateRep(existingUser.id, trimmedEmail, trimmedFirst, trimmedLast);
        queryClient.invalidateQueries({ queryKey: ['users', 'salesReps', companyId] });
        setAddModalVisible(false);
        Alert.alert(
          'Success',
          'This email belonged to a previous team member. They have been reactivated and a password reset email has been sent to them.',
        );
        return;
      }

      // Scenario C: brand new user — proceed with normal creation flow.
      await createRep({
        email: trimmedEmail,
        firstName: trimmedFirst,
        lastName: trimmedLast,
        companyId,
        role: newRepRole,
      });
      setAddModalVisible(false);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to create rep. Please try again.');
    }
  };

  const handleOpenActionModal = (rep: SalesRep) => {
    setSelectedRep(rep);
    setActionModalVisible(true);
  };

  const handleRevokeAccess = () => {
    if (!selectedRep) return;
    Alert.alert(
      'Revoke Access',
      `Remove ${selectedRep.firstName} ${selectedRep.lastName} from your team? They will no longer be able to log in.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke Access',
          style: 'destructive',
          onPress: async () => {
            setIsActioning(true);
            try {
              await deactivateRep(selectedRep.id);
              queryClient.invalidateQueries({ queryKey: ['users', 'salesReps', companyId] });
              setActionModalVisible(false);
            } catch (err: any) {
              Alert.alert('Error', err.message ?? 'Failed to revoke access.');
            } finally {
              setIsActioning(false);
            }
          },
        },
      ],
    );
  };

  const handleReactivate = () => {
    if (!selectedRep) return;
    const allowedSeats = company?.allowedSeats ?? 0;
    if (activeReps.length >= allowedSeats) {
      Alert.alert(
        'Seat Limit Reached',
        'You must upgrade your plan or revoke access from another user before reactivating this rep.',
      );
      return;
    }
    Alert.alert(
      'Reactivate Access',
      `Restore access for ${selectedRep.firstName} ${selectedRep.lastName}? They will be able to log in again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reactivate',
          onPress: async () => {
            setIsActioning(true);
            try {
              await reactivateRep(selectedRep.id);
              queryClient.invalidateQueries({ queryKey: ['users', 'salesReps', companyId] });
              setActionModalVisible(false);
            } catch (err: any) {
              Alert.alert('Error', err.message ?? 'Failed to reactivate rep.');
            } finally {
              setIsActioning(false);
            }
          },
        },
      ],
    );
  };

  // ─── Loading / Auth Guard ─────────────────────────────────────────────────────

  if (authLoading || userProfile?.role !== 'SuperAdmin') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (companyLoading || repsLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const allowedSeats = company?.allowedSeats ?? 0;
  const isRepInactive = selectedRep?.isActive === false;

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </Pressable>
        <View style={styles.headerText}>
          <Typography style={styles.title}>Team Management</Typography>
          <Typography style={styles.seatCount}>
            Active Seats: {activeReps.length} / {allowedSeats}
          </Typography>
        </View>
        <Pressable style={styles.addButton} onPress={handleOpenAddModal}>
          <Ionicons name="add" size={28} color={COLORS.primary} />
        </Pressable>
      </View>

      {/* ── Show Inactive Toggle ── */}
      <View style={styles.toggleRow}>
        <Typography style={styles.toggleLabel}>Show Inactive Team Members</Typography>
        <Switch
          value={showInactive}
          onValueChange={setShowInactive}
          trackColor={{ false: COLORS.border, true: COLORS.primary }}
          thumbColor={COLORS.white}
        />
      </View>

      {/* ── Rep List ── */}
      {displayedReps.length === 0 ? (
        <View style={styles.empty}>
          <Typography style={styles.emptyText}>
            {showInactive ? 'No team members found.' : 'No active reps. Tap + to add one.'}
          </Typography>
        </View>
      ) : (
        <FlatList
          data={displayedReps}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item: rep }) => {
            const inactive = rep.isActive === false;
            return (
              <Card elevation="sm" style={[styles.repCard, inactive && styles.repCardInactive]}>
                <View style={styles.repCardInner}>
                  <View style={[styles.avatar, inactive && styles.avatarInactive]}>
                    <Typography style={styles.avatarText}>
                      {(rep.firstName?.[0] ?? '').toUpperCase()}
                      {(rep.lastName?.[0] ?? '').toUpperCase()}
                    </Typography>
                  </View>
                  <View style={styles.repInfo}>
                    <Typography style={[styles.repName, inactive && styles.repNameInactive]}>
                      {rep.firstName} {rep.lastName}
                    </Typography>
                    <View style={styles.repRoleRow}>
                      <Typography style={styles.repRole}>{rep.role}</Typography>
                      {inactive && (
                        <View style={styles.inactiveBadge}>
                          <Typography style={styles.inactiveBadgeText}>Inactive</Typography>
                        </View>
                      )}
                    </View>
                  </View>
                  <Pressable
                    style={styles.editBtn}
                    onPress={() => handleOpenActionModal(rep)}
                    hitSlop={8}
                  >
                    <Ionicons name="pencil" size={18} color={COLORS.textMuted} />
                  </Pressable>
                </View>
              </Card>
            );
          }}
        />
      )}

      {/* ── Add Rep Modal ── */}
      <Modal
        visible={addModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setAddModalVisible(false)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>

            <View style={styles.modalHeader}>
              <Typography style={styles.modalTitle}>Add New Rep</Typography>
              <Pressable onPress={() => setAddModalVisible(false)} hitSlop={12}>
                <Typography style={styles.modalClose}>✕</Typography>
              </Pressable>
            </View>

            <View style={styles.fieldGroup}>
              <Typography style={styles.fieldLabel}>First Name</Typography>
              <TextInput
                style={styles.input}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="Jane"
                placeholderTextColor={COLORS.textDisabled}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Typography style={styles.fieldLabel}>Last Name</Typography>
              <TextInput
                style={styles.input}
                value={lastName}
                onChangeText={setLastName}
                placeholder="Smith"
                placeholderTextColor={COLORS.textDisabled}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Typography style={styles.fieldLabel}>Role</Typography>
              <View style={styles.roleRow}>
                {(['Sales', 'Production'] as const).map((role) => (
                  <Pressable
                    key={role}
                    style={[styles.roleChip, newRepRole === role && styles.roleChipActive]}
                    onPress={() => setNewRepRole(role)}
                  >
                    <Typography
                      style={[styles.roleChipText, newRepRole === role && styles.roleChipTextActive]}
                    >
                      {role}
                    </Typography>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Typography style={styles.fieldLabel}>Email</Typography>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="jane@example.com"
                placeholderTextColor={COLORS.textDisabled}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <Typography style={styles.passwordHint}>
              A temporary password of "Welcome123!" will be set. The rep can change it after first login.
            </Typography>

            <Pressable
              style={[styles.submitBtn, isCreating && styles.btnDisabled]}
              onPress={handleAddRep}
              disabled={isCreating}
            >
              {isCreating ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Typography style={styles.submitBtnText}>Create Rep</Typography>
              )}
            </Pressable>

          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Action Modal ── */}
      <Modal
        visible={actionModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setActionModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setActionModalVisible(false)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>

            <View style={styles.modalHeader}>
              <Typography style={styles.modalTitle}>
                {selectedRep?.firstName} {selectedRep?.lastName}
              </Typography>
              <Pressable onPress={() => setActionModalVisible(false)} hitSlop={12}>
                <Typography style={styles.modalClose}>✕</Typography>
              </Pressable>
            </View>

            <Typography style={styles.actionSubtitle}>{selectedRep?.role}</Typography>

            {isRepInactive ? (
              <Pressable
                style={[styles.reactivateBtn, isActioning && styles.btnDisabled]}
                onPress={handleReactivate}
                disabled={isActioning}
              >
                {isActioning ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <Typography style={styles.actionBtnText}>Reactivate Access</Typography>
                )}
              </Pressable>
            ) : (
              <Pressable
                style={[styles.revokeBtn, isActioning && styles.btnDisabled]}
                onPress={handleRevokeAccess}
                disabled={isActioning}
              >
                {isActioning ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <Typography style={styles.actionBtnText}>Revoke Access</Typography>
                )}
              </Pressable>
            )}

            <Pressable
              style={styles.cancelActionBtn}
              onPress={() => setActionModalVisible(false)}
            >
              <Typography style={styles.cancelActionBtnText}>Cancel</Typography>
            </Pressable>

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
    paddingBottom: 20,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACING.md,
    borderBottomWidth: 3,
    borderBottomColor: '#1b5e20',
  },
  backBtn: {
    paddingBottom: 2,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 26,
    fontWeight: FONT_WEIGHT.heavy,
    color: COLORS.white,
  },
  seatCount: {
    fontSize: FONT_SIZE.base,
    color: '#c8e6c9',
    marginTop: 4,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },

  // Toggle
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  toggleLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHT.semibold,
  },

  // List
  list: {
    padding: SPACING.base,
    gap: SPACING.sm,
    paddingBottom: 60,
  },
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

  // Rep Card
  repCard: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.base,
  },
  repCardInactive: {
    opacity: 0.55,
  },
  repCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInactive: {
    backgroundColor: COLORS.textMuted,
  },
  avatarText: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.white,
  },
  repInfo: {
    flex: 1,
  },
  repName: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textPrimary,
  },
  repNameInactive: {
    color: COLORS.textMuted,
  },
  repRoleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: 2,
  },
  repRole: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
  },
  inactiveBadge: {
    backgroundColor: COLORS.border,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  inactiveBadgeText: {
    fontSize: 10,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  editBtn: {
    padding: SPACING.xs,
  },

  // Modal
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
    paddingBottom: 40,
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
  modalClose: {
    fontSize: FONT_SIZE.xl,
    color: COLORS.textSecondary,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: FONT_SIZE.base,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  roleRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  roleChip: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  roleChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  roleChipText: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textSecondary,
  },
  roleChipTextActive: {
    color: COLORS.white,
  },
  passwordHint: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
    lineHeight: 18,
  },
  submitBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  submitBtnText: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.white,
  },
  btnDisabled: {
    opacity: 0.6,
  },

  // Action Modal
  actionSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
    marginTop: -SPACING.sm,
    marginBottom: SPACING.sm,
  },
  revokeBtn: {
    backgroundColor: COLORS.error ?? '#d32f2f',
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  reactivateBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  actionBtnText: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.white,
  },
  cancelActionBtn: {
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  cancelActionBtnText: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textSecondary,
  },
});
