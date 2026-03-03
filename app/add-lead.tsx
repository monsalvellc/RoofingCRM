import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import type { JobMedia } from '../types';
import { useAuth } from '../context/AuthContext';
import LeadImagePicker from '../components/LeadImagePicker';
import { useCreateCustomer, useCreateJob, useGetAllCustomers } from '../hooks';
import { Button, Card, Typography, TextInput } from '../components/ui';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '../constants/theme';
import type { Customer, Job } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
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
] as const;

const JOB_TYPE_OPTIONS = ['Retail', 'Insurance'] as const;

const TRADE_OPTIONS = [
  'Roof',
  'Gutters',
  'Fascia',
  'Windows',
  'Window Wraps',
  'Window Screens',
  'Skylights',
  'Siding',
  'Framing',
  'Demolition',
  'Other',
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits.length ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AddLeadScreen() {
  const router = useRouter();
  const { user, userProfile } = useAuth();
  const companyId = userProfile?.companyId ?? '';

  // ─── Server State ───────────────────────────────────────────────────────────
  const { data: allCustomers = [] } = useGetAllCustomers(companyId);
  const { mutateAsync: createCustomerAsync, isPending: isCreatingCustomer } = useCreateCustomer();
  const { mutateAsync: createJobAsync, isPending: isCreatingJob } = useCreateJob();

  const isSaving = isCreatingCustomer || isCreatingJob;

  // ─── Existing Customer Selection ─────────────────────────────────────────────
  const [selectedExistingCustomer, setSelectedExistingCustomer] = useState<Customer | null>(null);

  // ─── Customer Fields ─────────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [leadSource, setLeadSource] = useState('');
  const [alternateAddress, setAlternateAddress] = useState('');
  const [notes, setNotes] = useState('');

  // ─── Job Fields ──────────────────────────────────────────────────────────────
  const [jobId] = useState(() => `JOB-${Date.now()}`);
  const [jobName, setJobName] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [measurements, setMeasurements] = useState('');
  const [jobType, setJobType] = useState<'Retail' | 'Insurance'>('Insurance');
  const [status, setStatus] = useState<Job['status']>('Lead');
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [trades, setTrades] = useState<string[]>(['Roof']);
  const [customTrade, setCustomTrade] = useState('');
  const [jobNotes, setJobNotes] = useState('');

  // ─── Financials ──────────────────────────────────────────────────────────────
  const [contractAmount, setContractAmount] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositPaid, setDepositPaid] = useState(false);
  const [payments, setPayments] = useState<number[]>([]);
  const [newPayment, setNewPayment] = useState('');

  // ─── Files ───────────────────────────────────────────────────────────────────
  const [mediaFiles, setMediaFiles] = useState<JobMedia[]>([]);
  const [folderPermissions, setFolderPermissions] = useState<Record<string, boolean>>({});

  // ─── Insurance ───────────────────────────────────────────────────────────────
  const [carrier, setCarrier] = useState('');
  const [claimNumber, setClaimNumber] = useState('');
  const [deductible, setDeductible] = useState('');
  const [adjusterName, setAdjusterName] = useState('');
  const [adjusterPhone, setAdjusterPhone] = useState('');
  const [adjusterEmail, setAdjusterEmail] = useState('');
  const [dateOfLoss, setDateOfLoss] = useState('');
  const [dateOfDiscovery, setDateOfDiscovery] = useState('');

  // ─── Derived Data ────────────────────────────────────────────────────────────
  const isFormValid = name.trim().length > 0 && address.trim().length > 0;

  const filteredCustomers = useMemo(() => {
    if (!name.trim() || selectedExistingCustomer) return [];
    const lower = name.toLowerCase();
    return allCustomers.filter((c) =>
      `${c.firstName || ''} ${c.lastName || ''}`.toLowerCase().includes(lower),
    );
  }, [name, allCustomers, selectedExistingCustomer]);

  const parsedContract = parseFloat(contractAmount.replace(/[^0-9.]/g, '')) || 0;
  const parsedDeposit = parseFloat(depositAmount.replace(/[^0-9.]/g, '')) || 0;
  const paymentsTotal = payments.reduce((sum, p) => sum + p, 0);
  const balance = parsedContract - (depositPaid ? parsedDeposit : 0) - paymentsTotal;

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handlePhoneChange = (text: string) => setPhone(formatPhone(text));

  const formatDollarOnBlur = (value: string, setter: (v: string) => void) => {
    if (!value) return;
    const cleaned = value.replace(/[^0-9.]/g, '');
    if (cleaned) setter('$' + cleaned);
  };

  const toggleTrade = (t: string) => {
    setTrades((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  };

  const addPayment = () => {
    const amount = parseFloat(newPayment.replace(/[^0-9.]/g, ''));
    if (!amount || amount <= 0) return;
    setPayments((prev) => [...prev, amount]);
    setNewPayment('');
  };

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedExistingCustomer(customer);
    setName(`${customer.firstName} ${customer.lastName}`.trim());
    setPhone(customer.phone || '');
    setAddress(customer.address || '');
    setEmail(customer.email || '');
    setLeadSource(customer.leadSource || '');
    setAlternateAddress(customer.alternateAddress || '');
    setNotes(customer.notes || '');
  };

  const handleClearCustomerSelection = () => {
    setSelectedExistingCustomer(null);
    setName('');
    setPhone('');
    setAddress('');
    setEmail('');
    setLeadSource('');
    setAlternateAddress('');
    setNotes('');
  };

  const handleSave = async () => {
    const nameParts = name.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const finalTrades = trades
      .map((t) => (t === 'Other' && customTrade.trim() ? customTrade.trim() : t))
      .filter((t) => t !== 'Other' || customTrade.trim());

    const parsedDeductible = parseFloat(deductible.replace(/[^0-9.]/g, '')) || 0;
    const now = Date.now();

    const inspectionPhotos = mediaFiles.filter((m) => m.category === 'inspection');
    const installPhotos = mediaFiles.filter((m) => m.category === 'install');

    // Geocode silently — never blocks save on failure
    let locationCoords: { lat: number; lng: number } | null = null;
    try {
      const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
      if (locStatus === 'granted') {
        const geocoded = await Location.geocodeAsync(address);
        if (geocoded && geocoded.length > 0) {
          locationCoords = { lat: geocoded[0].latitude, lng: geocoded[0].longitude };
        }
      }
    } catch (e) {
      console.log('Geocoding error (non-blocking):', e);
    }

    try {
      let customerId: string;

      if (selectedExistingCustomer) {
        customerId = selectedExistingCustomer.id;
      } else {
        const newCustomer = await createCustomerAsync({
          data: {
            companyId,
            firstName,
            lastName,
            phone: phone || '',
            email: email || '',
            address,
            alternateAddress: alternateAddress || '',
            leadSource: leadSource || '',
            notes: notes || '',
            location: locationCoords ?? undefined,
            createdAt: now,
            updatedAt: now,
            isDeleted: false,
          },
          creator: user?.uid
            ? {
                id: user.uid,
                name: `${userProfile?.firstName ?? ''} ${userProfile?.lastName ?? ''}`.trim() || 'Rep',
              }
            : null,
        });
        customerId = newCustomer.id;
      }

      await createJobAsync({
        customerId,
        companyId,
        jobId,
        assignedUserIds: user?.uid ? [user.uid] : [],
        status,
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
        customerName: `${firstName} ${lastName}`.trim(),
        customerPhone: phone || '',
        jobName: jobName || '',
        jobDescription: jobDescription || '',
        measurements: measurements || '',
        jobType,
        jobNotes: jobNotes || '',
        trades: finalTrades,
        contractAmount: parsedContract,
        depositAmount: parsedDeposit,
        isDepositPaid: depositPaid,
        payments,
        balance,
        carrier: carrier || '',
        claimNumber: claimNumber || '',
        deductible: parsedDeductible,
        adjusterName: adjusterName || '',
        adjusterPhone: adjusterPhone || '',
        adjusterEmail: adjusterEmail || '',
        dateOfLoss: dateOfLoss || '',
        dateOfDiscovery: dateOfDiscovery || '',
        mainMaterialCost: 0,
        additionalSpent: [],
        returnedMaterialCredit: 0,
        installersCost: 0,
        guttersCost: 0,
        files: [],
        folderPermissions,
        inspectionPhotos,
        installPhotos,
      });

      Alert.alert('Success', 'Customer & Job Saved', [
        {
          text: 'OK',
          onPress: () => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/');
            }
          },
        },
      ]);
    } catch (e: any) {
      Alert.alert('Save Failed', e.message ?? 'An unexpected error occurred.');
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <Stack.Screen options={{ title: 'New Lead' }} />

      {/* ── Status Picker Modal ── */}
      <Modal
        visible={statusModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setStatusModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setStatusModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <Typography style={styles.modalTitle}>Select Status</Typography>
            {STATUS_OPTIONS.map((opt) => (
              <Pressable
                key={opt}
                style={[styles.modalOption, status === opt && styles.modalOptionActive]}
                onPress={() => {
                  setStatus(opt);
                  setStatusModalVisible(false);
                }}
              >
                <Typography
                  style={[
                    styles.modalOptionText,
                    status === opt && styles.modalOptionTextActive,
                  ]}
                >
                  {opt}
                </Typography>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Customer Info ── */}
          <Typography style={styles.sectionTitle}>Customer Info</Typography>
          <Card elevation="sm" style={styles.section}>

            {/* Name field with autocomplete dropdown */}
            <View>
              <TextInput
                label="Name *"
                placeholder="Full name"
                value={name}
                onChangeText={(text) => {
                  setName(text);
                  if (selectedExistingCustomer) setSelectedExistingCustomer(null);
                }}
              />
              {filteredCustomers.length > 0 && (
                <View style={styles.customerDropdown}>
                  {filteredCustomers.map((c) => (
                    <Pressable
                      key={c.id}
                      style={styles.customerDropdownItem}
                      onPress={() => handleSelectCustomer(c)}
                    >
                      <Typography style={styles.customerDropdownName}>
                        {c.firstName} {c.lastName}
                      </Typography>
                      <Typography style={styles.customerDropdownAddress}>{c.address}</Typography>
                    </Pressable>
                  ))}
                </View>
              )}
              {selectedExistingCustomer && (
                <View style={styles.selectedCustomerBadge}>
                  <Typography style={styles.selectedCustomerText}>
                    ✓ Existing customer linked — no duplicate will be created
                  </Typography>
                  <Button
                    variant="ghost"
                    size="sm"
                    label="Clear"
                    onPress={handleClearCustomerSelection}
                    style={styles.clearBtn}
                  />
                </View>
              )}
            </View>

            <TextInput
              label="Phone"
              placeholder="(###) ###-####"
              keyboardType="phone-pad"
              maxLength={14}
              value={phone}
              onChangeText={handlePhoneChange}
            />
            <TextInput
              label="Address *"
              placeholder="Street address"
              value={address}
              onChangeText={setAddress}
            />
            <TextInput
              label="Email"
              placeholder="email@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              label="Lead Source"
              placeholder="e.g. Door Knock, Referral"
              value={leadSource}
              onChangeText={setLeadSource}
            />
            <TextInput
              label="Alternate Address"
              placeholder="Billing or secondary address"
              value={alternateAddress}
              onChangeText={setAlternateAddress}
            />
            <TextInput
              label="Notes"
              placeholder="Any additional notes about this customer"
              multiline
              textAlignVertical="top"
              style={styles.multilineInputInner}
              value={notes}
              onChangeText={setNotes}
            />
          </Card>

          {/* ── Job Details ── */}
          <Typography style={styles.sectionTitle}>Job Details</Typography>
          <Card elevation="sm" style={styles.section}>

            {/* Job ID (read-only) */}
            <View>
              <Typography style={styles.fieldLabel}>Job ID</Typography>
              <View style={styles.readOnlyField}>
                <Typography style={styles.readOnlyText}>{jobId}</Typography>
              </View>
            </View>

            <TextInput
              label="Job Name"
              placeholder="e.g. Smith Roof Replacement"
              value={jobName}
              onChangeText={setJobName}
            />
            <TextInput
              label="Job Description"
              placeholder="Scope of work"
              multiline
              textAlignVertical="top"
              style={styles.multilineInputInner}
              value={jobDescription}
              onChangeText={setJobDescription}
            />
            <TextInput
              label="Measurements"
              placeholder="e.g. 24 squares"
              value={measurements}
              onChangeText={setMeasurements}
            />

            {/* Job Type segmented control */}
            <View>
              <Typography style={styles.fieldLabel}>Job Type</Typography>
              <View style={styles.segmentedRow}>
                {JOB_TYPE_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt}
                    style={[
                      styles.segmentButton,
                      jobType === opt && styles.segmentButtonActive,
                    ]}
                    onPress={() => setJobType(opt)}
                  >
                    <Typography
                      style={[
                        styles.segmentText,
                        jobType === opt && styles.segmentTextActive,
                      ]}
                    >
                      {opt}
                    </Typography>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Status dropdown trigger */}
            <View>
              <Typography style={styles.fieldLabel}>Status</Typography>
              <Pressable
                style={styles.dropdown}
                onPress={() => setStatusModalVisible(true)}
              >
                <Typography style={styles.dropdownText}>{status}</Typography>
                <Typography style={styles.dropdownArrow}>▼</Typography>
              </Pressable>
            </View>

            {/* Trades multi-select chips */}
            <View>
              <Typography style={styles.fieldLabel}>Trades</Typography>
              <View style={styles.chipRow}>
                {TRADE_OPTIONS.map((opt) => {
                  const selected = trades.includes(opt);
                  return (
                    <Pressable
                      key={opt}
                      style={[styles.chip, selected && styles.chipActive]}
                      onPress={() => toggleTrade(opt)}
                    >
                      <Typography
                        style={[styles.chipText, selected && styles.chipTextActive]}
                      >
                        {opt}
                      </Typography>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            {trades.includes('Other') && (
              <TextInput
                label="Custom Trade"
                placeholder="Describe the trade"
                value={customTrade}
                onChangeText={setCustomTrade}
              />
            )}

            <TextInput
              label="Job Notes"
              placeholder="Specific details (e.g. 'Use 6-inch gutters')"
              multiline
              textAlignVertical="top"
              style={styles.multilineInputInner}
              value={jobNotes}
              onChangeText={setJobNotes}
            />
          </Card>

          {/* ── Financials ── */}
          <Typography style={styles.sectionTitle}>Financials</Typography>
          <Card elevation="sm" style={styles.section}>
            <TextInput
              label="Contract Amount"
              placeholder="$0.00"
              keyboardType="numeric"
              value={contractAmount}
              onChangeText={setContractAmount}
              onBlur={() => formatDollarOnBlur(contractAmount, setContractAmount)}
            />

            <View style={styles.depositRow}>
              <View style={styles.depositInputWrapper}>
                <TextInput
                  label="Deposit Amount"
                  placeholder="$0.00"
                  keyboardType="numeric"
                  value={depositAmount}
                  onChangeText={setDepositAmount}
                  onBlur={() => formatDollarOnBlur(depositAmount, setDepositAmount)}
                />
              </View>
              <View style={styles.depositToggle}>
                <Typography style={styles.depositLabel}>Deposit Paid?</Typography>
                <Switch
                  value={depositPaid}
                  onValueChange={setDepositPaid}
                  trackColor={{ false: COLORS.border, true: COLORS.primaryLight }}
                  thumbColor={depositPaid ? COLORS.primary : COLORS.background}
                />
              </View>
            </View>

            {/* Add Payment */}
            <View>
              <Typography style={styles.fieldLabel}>Payments</Typography>
              <View style={styles.addPaymentRow}>
                <View style={styles.paymentInputWrapper}>
                  <TextInput
                    placeholder="Amount ($)"
                    keyboardType="numeric"
                    value={newPayment}
                    onChangeText={setNewPayment}
                  />
                </View>
                <Button
                  variant="primary"
                  size="sm"
                  label="+ Add"
                  onPress={addPayment}
                  style={styles.addPaymentButton}
                />
              </View>
            </View>

            {payments.length > 0 && (
              <View style={styles.paymentsList}>
                {payments.map((p, i) => (
                  <View key={i} style={styles.paymentItem}>
                    <Typography style={styles.paymentItemText}>
                      Payment {i + 1}: ${p.toFixed(2)}
                    </Typography>
                    <Pressable
                      onPress={() => setPayments((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      <Typography style={styles.paymentRemove}>Remove</Typography>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            {/* Balance */}
            <View style={styles.balanceRow}>
              <Typography style={styles.balanceLabel}>Balance</Typography>
              <Typography
                style={[styles.balanceValue, balance < 0 && styles.balanceNegative]}
              >
                ${balance.toFixed(2)}
              </Typography>
            </View>
          </Card>

          {/* ── Insurance Details (conditional) ── */}
          {jobType === 'Insurance' && (
            <>
              <Typography style={styles.sectionTitle}>Insurance Details</Typography>
              <Card elevation="sm" style={styles.section}>
                <TextInput label="Carrier" placeholder="Insurance company name" value={carrier} onChangeText={setCarrier} />
                <TextInput label="Claim Number" placeholder="Claim #" value={claimNumber} onChangeText={setClaimNumber} />
                <TextInput
                  label="Deductible"
                  placeholder="$0.00"
                  keyboardType="numeric"
                  value={deductible}
                  onChangeText={setDeductible}
                  onBlur={() => formatDollarOnBlur(deductible, setDeductible)}
                />
                <TextInput label="Adjuster Name" placeholder="Full name" value={adjusterName} onChangeText={setAdjusterName} />
                <TextInput label="Adjuster Phone" placeholder="(###) ###-####" keyboardType="phone-pad" value={adjusterPhone} onChangeText={setAdjusterPhone} />
                <TextInput label="Adjuster Email" placeholder="adjuster@insurer.com" keyboardType="email-address" autoCapitalize="none" value={adjusterEmail} onChangeText={setAdjusterEmail} />
                <TextInput label="Date of Loss" placeholder="MM/DD/YYYY" value={dateOfLoss} onChangeText={setDateOfLoss} />
                <TextInput label="Date of Discovery" placeholder="MM/DD/YYYY" value={dateOfDiscovery} onChangeText={setDateOfDiscovery} />
              </Card>
            </>
          )}

          {/* ── Files ── */}
          <Typography style={styles.sectionTitle}>Files</Typography>
          <LeadImagePicker
            companyId={companyId}
            onUpdate={(media, perms) => {
              setMediaFiles(media);
              setFolderPermissions(perms);
            }}
          />

          {/* ── Save ── */}
          <Button
            variant="primary"
            size="lg"
            label={isSaving ? 'Saving...' : 'SAVE LEAD'}
            onPress={handleSave}
            disabled={!isFormValid || isSaving}
            isLoading={isSaving}
            style={styles.saveButton}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: {
    padding: SPACING.lg,
    paddingBottom: 40,
  },

  // Section title
  sectionTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  section: {
    gap: SPACING.md,
    padding: SPACING.base,
  },

  // Multiline inner height hint (goes to RNTextInput via ...rest)
  multilineInputInner: {
    minHeight: 80,
  },

  // Read-only field
  readOnlyField: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: 14,
    backgroundColor: COLORS.background,
    marginTop: SPACING.xs,
  },
  readOnlyText: {
    fontSize: FONT_SIZE.base,
    color: COLORS.textMuted,
    fontWeight: FONT_WEIGHT.semibold,
  },

  // Field label (used above non-TextInput controls like chips, segmented, dropdown)
  fieldLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },

  // Segmented control (job type)
  segmentedRow: {
    flexDirection: 'row',
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    marginTop: SPACING.xs,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  segmentButtonActive: {
    backgroundColor: COLORS.primary,
  },
  segmentText: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textMuted,
  },
  segmentTextActive: {
    color: COLORS.white,
  },

  // Status dropdown trigger
  dropdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    backgroundColor: COLORS.surface,
    marginTop: SPACING.xs,
  },
  dropdownText: {
    fontSize: FONT_SIZE.base,
    color: COLORS.textPrimary,
  },
  dropdownArrow: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textDisabled,
  },

  // Status modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: SPACING.lg,
    paddingBottom: 40,
    gap: SPACING.xs,
  },
  modalTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  modalOption: {
    paddingVertical: 14,
    paddingHorizontal: SPACING.base,
    borderRadius: RADIUS.lg,
  },
  modalOptionActive: {
    backgroundColor: COLORS.successBg,
  },
  modalOptionText: {
    fontSize: FONT_SIZE.base,
    color: COLORS.textSecondary,
  },
  modalOptionTextActive: {
    color: COLORS.primary,
    fontWeight: FONT_WEIGHT.bold,
  },

  // Trade chips
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  chip: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: 14,
    borderRadius: RADIUS.round,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  chipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.successBg,
  },
  chipText: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textMuted,
  },
  chipTextActive: {
    color: COLORS.primary,
  },

  // Financials
  depositRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    alignItems: 'flex-end',
  },
  depositInputWrapper: {
    flex: 1,
  },
  depositToggle: {
    alignItems: 'center',
    gap: SPACING.xs,
    paddingBottom: SPACING.xs,
  },
  depositLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textSecondary,
  },
  addPaymentRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'flex-end',
    marginTop: SPACING.xs,
  },
  paymentInputWrapper: {
    flex: 1,
  },
  addPaymentButton: {
    borderRadius: RADIUS.md,
    minHeight: 48,
    paddingHorizontal: SPACING.base,
  },
  paymentsList: {
    gap: SPACING.xs,
  },
  paymentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
  },
  paymentItemText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHT.medium,
  },
  paymentRemove: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.danger,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.successBg,
    padding: 14,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  balanceLabel: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  balanceValue: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.heavy,
    color: COLORS.primary,
  },
  balanceNegative: {
    color: COLORS.danger,
  },

  // Customer autocomplete
  customerDropdown: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    marginTop: SPACING.xs,
    backgroundColor: COLORS.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  customerDropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: SPACING.base,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  customerDropdownName: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  customerDropdownAddress: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  selectedCustomerBadge: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.successBg,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.base,
    borderWidth: 1,
    borderColor: '#c8e6c9',
    marginTop: SPACING.sm,
  },
  selectedCustomerText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.primary,
    flex: 1,
  },
  clearBtn: {
    paddingHorizontal: SPACING.sm,
  },

  // Save button
  saveButton: {
    marginTop: SPACING.xxl,
    borderRadius: RADIUS.xl,
  },
});
