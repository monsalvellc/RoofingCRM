import { useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useGetCompany, useGetSalesReps, useCreateRep, useUpdateUserProfile } from '../../hooks';
import { updateUserProfile } from '../../services';
import { Card, Typography } from '../../components/ui';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '../../constants/theme';
import type { SalesRep } from '../../types';

// ─── Component ────────────────────────────────────────────────────────────────

export default function TeamScreen() {
  const { userProfile } = useAuth();
  const companyId = userProfile?.companyId ?? '';

  const { data: company, isLoading: companyLoading } = useGetCompany(companyId);
  const { data: salesReps = [], isLoading: repsLoading } = useGetSalesReps(companyId);
  const { mutateAsync: createRep, isPending: isCreating } = useCreateRep();

  // ─── Add Rep Modal State ─────────────────────────────────────────────────────
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');

  // ─── Edit Rep Modal State ────────────────────────────────────────────────────
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingRep, setEditingRep] = useState<SalesRep | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleOpenAddModal = () => {
    const allowedSeats = company?.allowedSeats ?? 0;
    if (salesReps.length >= allowedSeats) {
      Alert.alert(
        'Seat Limit Reached',
        'Please upgrade your plan to add more reps.',
      );
      return;
    }
    setFirstName('');
    setLastName('');
    setEmail('');
    setAddModalVisible(true);
  };

  const handleAddRep = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      Alert.alert('Missing Fields', 'Please fill in all fields.');
      return;
    }
    try {
      await createRep({ email: email.trim(), firstName: firstName.trim(), lastName: lastName.trim(), companyId });
      setAddModalVisible(false);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to create rep. Please try again.');
    }
  };

  const handleOpenEditModal = (rep: SalesRep) => {
    setEditingRep(rep);
    setEditFirstName(rep.firstName);
    setEditLastName(rep.lastName);
    setEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!editingRep || !editFirstName.trim() || !editLastName.trim()) return;
    setIsSavingEdit(true);
    try {
      await updateUserProfile(editingRep.id, {
        firstName: editFirstName.trim(),
        lastName: editLastName.trim(),
      });
      setEditModalVisible(false);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to update rep.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // ─── Loading State ───────────────────────────────────────────────────────────

  if (companyLoading || repsLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const allowedSeats = company?.allowedSeats ?? 0;

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Typography style={styles.title}>Rep Management</Typography>
          <Typography style={styles.seatCount}>
            Seats: {salesReps.length} / {allowedSeats}
          </Typography>
        </View>
        <Pressable style={styles.addButton} onPress={handleOpenAddModal}>
          <Ionicons name="add" size={28} color={COLORS.primary} />
        </Pressable>
      </View>

      {/* ── Rep List ── */}
      {salesReps.length === 0 ? (
        <View style={styles.empty}>
          <Typography style={styles.emptyText}>No reps yet. Tap + to add one.</Typography>
        </View>
      ) : (
        <FlatList
          data={salesReps}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item: rep }) => (
            <Card elevation="sm" style={styles.repCard}>
              <View style={styles.repCardInner}>
                <View style={styles.avatar}>
                  <Typography style={styles.avatarText}>
                    {(rep.firstName?.[0] ?? '').toUpperCase()}
                    {(rep.lastName?.[0] ?? '').toUpperCase()}
                  </Typography>
                </View>
                <View style={styles.repInfo}>
                  <Typography style={styles.repName}>
                    {rep.firstName} {rep.lastName}
                  </Typography>
                  <Typography style={styles.repRole}>{rep.role}</Typography>
                </View>
                <Pressable
                  style={styles.editBtn}
                  onPress={() => handleOpenEditModal(rep)}
                  hitSlop={8}
                >
                  <Ionicons name="pencil" size={18} color={COLORS.textMuted} />
                </Pressable>
              </View>
            </Card>
          )}
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
              style={[styles.submitBtn, isCreating && styles.submitBtnDisabled]}
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

      {/* ── Edit Rep Modal ── */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setEditModalVisible(false)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>

            <View style={styles.modalHeader}>
              <Typography style={styles.modalTitle}>Edit Rep</Typography>
              <Pressable onPress={() => setEditModalVisible(false)} hitSlop={12}>
                <Typography style={styles.modalClose}>✕</Typography>
              </Pressable>
            </View>

            <View style={styles.fieldGroup}>
              <Typography style={styles.fieldLabel}>First Name</Typography>
              <TextInput
                style={styles.input}
                value={editFirstName}
                onChangeText={setEditFirstName}
                autoCapitalize="words"
                placeholderTextColor={COLORS.textDisabled}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Typography style={styles.fieldLabel}>Last Name</Typography>
              <TextInput
                style={styles.input}
                value={editLastName}
                onChangeText={setEditLastName}
                autoCapitalize="words"
                placeholderTextColor={COLORS.textDisabled}
              />
            </View>

            <Pressable
              style={[styles.submitBtn, isSavingEdit && styles.submitBtnDisabled]}
              onPress={handleSaveEdit}
              disabled={isSavingEdit}
            >
              {isSavingEdit ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Typography style={styles.submitBtnText}>Save Changes</Typography>
              )}
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
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottomWidth: 3,
    borderBottomColor: '#1b5e20',
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

  // List
  list: {
    padding: SPACING.base,
    gap: SPACING.sm,
    paddingBottom: 100,
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
  repRole: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
    marginTop: 2,
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
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.white,
  },
});
