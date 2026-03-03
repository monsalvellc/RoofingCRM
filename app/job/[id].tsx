import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  useGetJob,
  useUpdateJob,
  useCreateAdditionalJob,
  useUploadJobMedia,
  useDeleteJobMedia,
  useAddJobDocument,
  useDeleteJobDocument,
  useCustomerJobsListener,
} from '../../hooks';
import { useGetCustomer } from '../../hooks';
import { useHdPhotoQuality } from '../../hooks';
import { Button, Card, Typography, TextInput as UITextInput } from '../../components/ui';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '../../constants/theme';
import type { Job, JobFile, JobMedia } from '../../types';

// ─── Screen constants ─────────────────────────────────────────────────────────

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Status chip colors — these are business-logic values specific to the
// pipeline and are intentionally kept as local constants, not theme tokens.
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

const STATUSES: Job['status'][] = [
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

const AVAILABLE_TRADES = ['Roofing', 'Gutters', 'Siding', 'Windows', 'Skylights', 'Solar'];

const FILE_SECTIONS: { type: JobFile['type']; label: string }[] = [
  { type: 'inspection', label: 'Inspection Photos' },
  { type: 'install', label: 'Install Photos' },
  { type: 'document', label: 'Documents' },
];

const VIEWER_PHOTO_HEIGHT = SCREEN_HEIGHT - 140;

// ─── Input Mask Helpers ───────────────────────────────────────────────────────

function maskPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits.length ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function maskDate(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // ─── Server State (React Query) ───────────────────────────────────────────
  const { data: job, isLoading: isJobLoading, error: jobError } = useGetJob(id);
  const { data: customer } = useGetCustomer(job?.customerId ?? '');
  const { data: imageQuality = 0.75 } = useHdPhotoQuality();
  const { mutate: updateJobMutate, isPending: isUpdating } = useUpdateJob();
  const { mutate: createAdditionalJobMutate, isPending: isCreatingJob } = useCreateAdditionalJob();
  const { mutate: uploadMediaMutate, isPending: isUploadingMedia } = useUploadJobMedia();
  const { mutate: deleteMediaMutate } = useDeleteJobMedia();
  const { mutate: addDocumentMutate, isPending: isUploadingDoc } = useAddJobDocument();
  const { mutate: deleteDocumentMutate } = useDeleteJobDocument();
  const customerJobs = useCustomerJobsListener(job?.customerId ?? '');

  const isUploading = isUploadingMedia || isUploadingDoc;

  // ─── Local UI State ───────────────────────────────────────────────────────

  // File edit modal
  const [selectedFile, setSelectedFile] = useState<JobFile | null>(null);
  const [editingType, setEditingType] = useState<JobFile['type']>('inspection');
  const [editingShared, setEditingShared] = useState(false);

  // Full-screen viewer
  const [viewingMediaIdx, setViewingMediaIdx] = useState<number | null>(null);
  const [viewingMediaList, setViewingMediaList] = useState<JobMedia[]>([]);

  // Media edit modal
  const [selectedMedia, setSelectedMedia] = useState<JobMedia | null>(null);
  const [editingMediaShared, setEditingMediaShared] = useState(false);

  // Edit details modal
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Job>>({});

  // Add payment modal
  const [isAddingPayment, setIsAddingPayment] = useState(false);
  const [newPaymentAmount, setNewPaymentAmount] = useState('');

  // Job tab bar
  const [activeJobTab, setActiveJobTab] = useState<'details' | 'media'>('details');

  // Add Job modal
  const [isAddingJobModal, setIsAddingJobModal] = useState(false);
  const [newJobForm, setNewJobForm] = useState<{ jobName: string; jobType: 'Retail' | 'Insurance' }>({
    jobName: '',
    jobType: 'Retail',
  });

  // Stable refs required by FlatList
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0 && viewableItems[0].index !== null) {
      setViewingMediaIdx(viewableItems[0].index);
    }
  }).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  // ─── Handlers — Job Creation ──────────────────────────────────────────────

  const openAddJobModal = () => {
    setNewJobForm({ jobName: '', jobType: 'Retail' });
    setIsAddingJobModal(true);
  };

  const handleConfirmAddJob = () => {
    if (!job || isCreatingJob) return;
    createAdditionalJobMutate(
      {
        companyId: job.companyId,
        customerId: job.customerId,
        customerName: job.customerName ?? '',
        customerPhone: job.customerPhone ?? '',
        assignedUserIds: job.assignedUserIds ?? [],
        jobName: newJobForm.jobName.trim() || undefined,
        jobType: newJobForm.jobType,
      },
      {
        onSuccess: (newId) => {
          setIsAddingJobModal(false);
          router.setParams({ id: newId });
        },
        onError: () => Alert.alert('Error', 'Could not create job.'),
      },
    );
  };

  // ─── Handlers — Status ───────────────────────────────────────────────────

  const updateJobStatus = (newStatus: Job['status']) => {
    const payload: Partial<Job> = { status: newStatus };
    if (newStatus === 'Completed') payload.completedAt = new Date().toISOString();
    else payload.completedAt = null;
    updateJobMutate({ id, data: payload });
  };

  // ─── Handlers — Modals ───────────────────────────────────────────────────

  const openFileModal = (file: JobFile) => {
    setSelectedFile(file);
    setEditingType(file.type);
    setEditingShared(file.isSharedWithCustomer);
  };

  const openMediaModal = (media: JobMedia) => {
    setSelectedMedia(media);
    setEditingMediaShared(media.shared);
  };

  // ─── Handlers — Media Updates ────────────────────────────────────────────

  const handleUpdateMedia = () => {
    if (!selectedMedia || !job) return;
    const photoField = selectedMedia.category === 'inspection' ? 'inspectionPhotos' : 'installPhotos';
    const updatedMedia: JobMedia = { ...selectedMedia, shared: editingMediaShared };
    const updatedList = ((job as any)[photoField] as JobMedia[]).map((m: JobMedia) =>
      m.id === selectedMedia.id ? updatedMedia : m,
    );
    updateJobMutate(
      { id, data: { [photoField]: updatedList } as Partial<Job> },
      {
        onSuccess: () => setSelectedMedia(null),
        onError: () => Alert.alert('Error', 'Could not update photo.'),
      },
    );
  };

  const handleUpdateFile = () => {
    if (!selectedFile || !job) return;
    const updatedFile: JobFile = {
      ...selectedFile,
      type: editingType,
      isSharedWithCustomer: editingShared,
    };
    const updatedFiles = (job.files as any[]).map((f: any) =>
      f.id === selectedFile.id ? updatedFile : f,
    );
    updateJobMutate(
      { id, data: { files: updatedFiles as any } },
      {
        onSuccess: () => setSelectedFile(null),
        onError: () => Alert.alert('Error', 'Could not update file.'),
      },
    );
  };

  const handleDeleteDocument = (file: JobFile) => {
    Alert.alert(
      'Delete Document',
      'Are you sure you want to delete this document? This cannot be undone.',
      [
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (!job) return;
            const updatedFiles = (job.files as any[]).filter((f: any) => f.id !== file.id);
            deleteDocumentMutate(
              { jobId: id, file, updatedFiles },
              {
                onSuccess: () => setSelectedFile(null),
                onError: () => Alert.alert('Error', 'Could not delete document.'),
              },
            );
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  // ─── Handlers — Download ─────────────────────────────────────────────────

  const handleDownloadMedia = async (url: string, fileName: string) => {
    try {
      const fileUri = (FileSystem.documentDirectory ?? '') + fileName;
      const { uri } = await FileSystem.downloadAsync(url, fileUri);
      await Sharing.shareAsync(uri);
    } catch (e) {
      console.error('Download failed:', e);
      Alert.alert('Download Failed', 'Could not download the file. Please try again.');
    }
  };

  // ─── Handlers — Document Upload ──────────────────────────────────────────

  const handleAddDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*' });
    if (result.canceled) return;
    const asset = result.assets[0];
    addDocumentMutate(
      { jobId: id, uri: asset.uri, fileName: asset.name },
      {
        onError: () =>
          Alert.alert('Upload Failed', 'Could not upload document. Please try again.'),
      },
    );
  };

  // ─── Handlers — Photo Upload ─────────────────────────────────────────────

  const handleCameraPhoto = async (photoType: 'inspectionPhotos' | 'installPhotos') => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera access is needed to take photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: imageQuality });
    if (!result.canceled) {
      uploadMediaMutate(
        { jobId: id, photoType, uris: [result.assets[0].uri] },
        {
          onError: () =>
            Alert.alert('Upload Failed', 'Could not upload photo. Please try again.'),
        },
      );
    }
  };

  const handleGalleryPhoto = async (photoType: 'inspectionPhotos' | 'installPhotos') => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: imageQuality,
      allowsMultipleSelection: true,
      selectionLimit: 10,
    });
    if (!result.canceled) {
      uploadMediaMutate(
        { jobId: id, photoType, uris: result.assets.map((a) => a.uri) },
        {
          onError: () =>
            Alert.alert('Upload Failed', 'Could not upload photos. Please try again.'),
        },
      );
    }
  };

  const handleDeletePhoto = (media: JobMedia) => {
    const photoField = media.category === 'inspection' ? 'inspectionPhotos' : 'installPhotos';
    Alert.alert('Delete Photo', 'Are you sure you want to delete this photo?', [
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (!job) return;
          const updatedList = ((job as any)[photoField] as JobMedia[]).filter(
            (m) => m.id !== media.id,
          );
          deleteMediaMutate(
            { jobId: id, media, updatedList },
            { onError: () => Alert.alert('Error', 'Could not delete photo.') },
          );
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // ─── Handlers — Edit Details ─────────────────────────────────────────────

  const handleSaveDetails = () => {
    if (!job) return;
    const contractAmount =
      parseFloat(String(editForm.contractAmount ?? 0).replace(/[^0-9.]/g, '')) || 0;
    const depositAmount =
      parseFloat(String(editForm.depositAmount ?? 0).replace(/[^0-9.]/g, '')) || 0;
    const paymentsSum = (job.payments ?? []).reduce((sum: number, p: number) => sum + p, 0);
    const balance = contractAmount - (job.isDepositPaid ? depositAmount : 0) - paymentsSum;

    const updates: Partial<Job> = {
      jobName: editForm.jobName ?? job.jobName ?? '',
      jobType: editForm.jobType ?? job.jobType ?? 'Retail',
      trades: editForm.trades ?? job.trades ?? [],
      measurements: editForm.measurements ?? job.measurements ?? '',
      jobDescription: editForm.jobDescription ?? job.jobDescription ?? '',
      jobNotes: editForm.jobNotes ?? job.jobNotes ?? '',
      contractAmount,
      depositAmount,
      isDepositPaid: job.isDepositPaid ?? false,
      balance,
      carrier: editForm.carrier ?? job.carrier ?? '',
      claimNumber: editForm.claimNumber ?? job.claimNumber ?? '',
      deductible:
        parseFloat(String(editForm.deductible ?? 0).replace(/[^0-9.]/g, '')) || 0,
      adjusterName: editForm.adjusterName ?? job.adjusterName ?? '',
      adjusterPhone: editForm.adjusterPhone ?? job.adjusterPhone ?? '',
      adjusterEmail: editForm.adjusterEmail ?? job.adjusterEmail ?? '',
      dateOfLoss: editForm.dateOfLoss ?? job.dateOfLoss ?? '',
      dateOfDiscovery: editForm.dateOfDiscovery ?? job.dateOfDiscovery ?? '',
    };

    updateJobMutate(
      { id, data: updates },
      {
        onSuccess: () => setIsEditingDetails(false),
        onError: () => Alert.alert('Error', 'Could not save changes.'),
      },
    );
  };

  const toggleDepositStatus = (newValue: boolean) => {
    if (!job) return;
    const newBalance =
      job.contractAmount -
      (newValue ? job.depositAmount || 0 : 0) -
      (job.payments || []).reduce((a: number, b: number) => a + b, 0);
    updateJobMutate({ id, data: { isDepositPaid: newValue, balance: newBalance } });
  };

  // ─── Handlers — Payments ─────────────────────────────────────────────────

  const handleSavePayment = () => {
    if (!job) return;
    const amount = parseFloat(newPaymentAmount.replace(/[^0-9.]/g, ''));
    if (!amount || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid payment amount.');
      return;
    }
    const updatedPayments = [...(job.payments ?? []), amount];
    const balance =
      (job.contractAmount ?? 0) -
      (job.isDepositPaid ? job.depositAmount ?? 0 : 0) -
      updatedPayments.reduce((sum: number, p: number) => sum + p, 0);

    updateJobMutate(
      { id, data: { payments: updatedPayments, balance } },
      {
        onSuccess: () => {
          setNewPaymentAmount('');
          setIsAddingPayment(false);
        },
        onError: () => Alert.alert('Error', 'Could not save payment.'),
      },
    );
  };

  // ─── Loading & Error States ───────────────────────────────────────────────

  if (isJobLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (jobError || !job) {
    return (
      <View style={styles.centered}>
        <Typography variant="body" color={COLORS.textMuted}>
          {(jobError as Error)?.message ?? 'Job not found.'}
        </Typography>
      </View>
    );
  }

  // ─── Derived values ───────────────────────────────────────────────────────

  const customerName = customer
    ? `${customer.firstName} ${customer.lastName}`.trim()
    : '—';

  const hasInsurance =
    job.carrier || job.adjusterName || job.adjusterPhone || job.adjusterEmail ||
    job.claimNumber || job.deductible || job.dateOfLoss || job.dateOfDiscovery;

  const currentViewingMedia =
    viewingMediaIdx !== null ? viewingMediaList[viewingMediaIdx] : null;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <Stack.Screen options={{ title: customerName || job.jobName || job.jobId }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>

        {/* ── Customer Profile ── */}
        <Typography variant="label" color={COLORS.textMuted} style={styles.sectionLabel}>
          Customer
        </Typography>
        <Card style={styles.infoCard}>
          <Row label="Name" value={customerName} />
          <Row label="Address" value={customer?.address} />
          {customer?.phone ? <Row label="Phone" value={customer.phone} /> : null}
          {customer?.email ? <Row label="Email" value={customer.email} /> : null}
          {customer?.alternateAddress ? (
            <Row label="Alt. Address" value={customer.alternateAddress} />
          ) : null}
          {customer?.leadSource ? <Row label="Lead Source" value={customer.leadSource} /> : null}
          {customer?.notes ? <Row label="Notes" value={customer.notes} /> : null}
        </Card>

        {/* ── Customer's Projects ── */}
        {customerJobs.length > 0 && (
          <>
            <Typography
              variant="label"
              color={COLORS.textMuted}
              style={[styles.sectionLabel, { marginTop: SPACING.lg }]}
            >
              Customer's Projects
            </Typography>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.projectsRow}
            >
              {customerJobs.map((cj) => {
                const isCurrent = cj.id === id;
                const chipColor = STATUS_COLORS[cj.status] ?? '#999';
                const date = cj.createdAt
                  ? new Date(cj.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: '2-digit',
                    })
                  : '—';
                return (
                  <Pressable
                    key={cj.id}
                    style={[
                      styles.projectPill,
                      isCurrent
                        ? { backgroundColor: chipColor, borderColor: chipColor }
                        : { backgroundColor: COLORS.background, borderColor: COLORS.border },
                    ]}
                    onPress={() => {
                      if (!isCurrent) router.setParams({ id: cj.id });
                    }}
                  >
                    <Typography
                      style={[
                        styles.projectPillDate,
                        isCurrent && { color: 'rgba(255,255,255,0.8)' },
                      ]}
                    >
                      {date}
                    </Typography>
                    <Typography
                      style={[styles.projectPillStatus, isCurrent && { color: COLORS.white }]}
                    >
                      {cj.status}
                    </Typography>
                    {isCurrent && <View style={styles.projectPillCurrentDot} />}
                  </Pressable>
                );
              })}
              <Pressable
                style={[styles.projectPill, styles.projectPillAdd, isCreatingJob && { opacity: 0.5 }]}
                onPress={openAddJobModal}
                disabled={isCreatingJob}
              >
                <Typography style={styles.projectPillAddText}>
                  {isCreatingJob ? '…' : '➕ Add Job'}
                </Typography>
              </Pressable>
            </ScrollView>
          </>
        )}

        {/* ── Job Tab Bar ── */}
        <View style={styles.jobTabRow}>
          {(['details', 'media'] as const).map((tab) => {
            const isActive = activeJobTab === tab;
            return (
              <Pressable
                key={tab}
                style={[styles.jobTabBtn, isActive && styles.jobTabBtnActive]}
                onPress={() => setActiveJobTab(tab)}
              >
                <Typography style={[styles.jobTabBtnText, isActive && styles.jobTabBtnTextActive]}>
                  {tab === 'details' ? 'Job Details' : 'Media & Docs'}
                </Typography>
              </Pressable>
            );
          })}
        </View>

        {/* ── Details Tab ── */}
        {activeJobTab === 'details' && (
          <>
            {/* Pipeline Status */}
            <Typography variant="label" color={COLORS.textMuted} style={styles.sectionLabel}>
              Pipeline Status
            </Typography>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pipelineRow}
            >
              {STATUSES.map((s) => {
                const isActive = job.status === s;
                const color = STATUS_COLORS[s] ?? '#999';
                return (
                  <Pressable
                    key={s}
                    style={[
                      styles.pipelineChip,
                      isActive
                        ? { backgroundColor: color, borderColor: color }
                        : { backgroundColor: COLORS.background, borderColor: COLORS.border },
                      isUpdating && styles.pipelineChipDisabled,
                    ]}
                    onPress={() => updateJobStatus(s)}
                    disabled={isUpdating}
                  >
                    <Typography
                      style={[
                        styles.pipelineChipText,
                        isActive ? { color: COLORS.white } : { color: COLORS.textSecondary },
                      ]}
                    >
                      {s}
                    </Typography>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Job Details */}
            <View style={styles.sectionTitleRow}>
              <Typography variant="label" color={COLORS.textMuted} style={styles.sectionLabel}>
                Job Details
              </Typography>
              <Button
                variant="ghost"
                size="sm"
                label="✏️ Edit Details"
                onPress={() => {
                  setEditForm({ ...job });
                  setIsEditingDetails(true);
                }}
              />
            </View>
            <Card style={styles.infoCard}>
              <Row label="Job ID" value={job.jobId} mono />
              {job.jobName ? <Row label="Job Name" value={job.jobName} /> : null}
              <Row label="Job Type" value={job.jobType} />
              <Row label="Trades" value={job.trades?.join(', ') || '—'} />
              {job.measurements ? <Row label="Measurements" value={job.measurements} /> : null}
              {job.jobDescription ? <Row label="Description" value={job.jobDescription} /> : null}
              {job.jobNotes ? <Row label="Job Notes" value={job.jobNotes} /> : null}
            </Card>

            {/* Financials */}
            <View style={styles.sectionTitleRow}>
              <Typography variant="label" color={COLORS.textMuted} style={styles.sectionLabel}>
                Financials
              </Typography>
              <Button
                variant="ghost"
                size="sm"
                label="➕ Add Payment"
                onPress={() => setIsAddingPayment(true)}
              />
            </View>
            <Card style={styles.infoCard}>
              <Row
                label="Contract"
                value={`$${job.contractAmount?.toFixed(2) ?? '0.00'}`}
              />
              <View style={[rowStyles.container, { alignItems: 'center' }]}>
                <Typography variant="label" color={COLORS.textMuted} style={{ flex: 1 }}>
                  {`Deposit ($${job.depositAmount?.toFixed(2) ?? '0.00'})`}
                </Typography>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                  <Typography
                    variant="label"
                    color={job.isDepositPaid ? COLORS.primary : COLORS.danger}
                  >
                    {job.isDepositPaid ? 'Paid' : 'Unpaid'}
                  </Typography>
                  <Switch
                    value={!!job.isDepositPaid}
                    onValueChange={toggleDepositStatus}
                    disabled={isUpdating}
                    trackColor={{ false: COLORS.border, true: COLORS.primaryLight }}
                    thumbColor={job.isDepositPaid ? COLORS.primary : COLORS.background}
                  />
                </View>
              </View>
              {job.payments?.length > 0 &&
                job.payments.map((p: number, i: number) => (
                  <Row key={i} label={`Payment ${i + 1}`} value={`$${p.toFixed(2)}`} />
                ))}
              <View style={styles.divider} />
              <View style={styles.balanceRow}>
                <Typography variant="label">Balance</Typography>
                <Typography
                  variant="h3"
                  color={(job.balance ?? 0) < 0 ? COLORS.danger : COLORS.primary}
                >
                  ${job.balance?.toFixed(2) ?? '0.00'}
                </Typography>
              </View>
            </Card>

            {/* Insurance Details */}
            {hasInsurance ? (
              <>
                <Typography
                  variant="label"
                  color={COLORS.textMuted}
                  style={styles.sectionLabel}
                >
                  Insurance Details
                </Typography>
                <Card style={styles.infoCard}>
                  {job.carrier ? <Row label="Carrier" value={job.carrier} /> : null}
                  {job.claimNumber ? <Row label="Claim #" value={job.claimNumber} /> : null}
                  {job.deductible ? (
                    <Row label="Deductible" value={`$${job.deductible.toFixed(2)}`} />
                  ) : null}
                  {job.adjusterName ? <Row label="Adjuster" value={job.adjusterName} /> : null}
                  {job.adjusterPhone ? (
                    <Row label="Adj. Phone" value={job.adjusterPhone} />
                  ) : null}
                  {job.adjusterEmail ? (
                    <Row label="Adj. Email" value={job.adjusterEmail} />
                  ) : null}
                  {job.dateOfLoss ? <Row label="Date of Loss" value={job.dateOfLoss} /> : null}
                  {job.dateOfDiscovery ? (
                    <Row label="Date of Discovery" value={job.dateOfDiscovery} />
                  ) : null}
                </Card>
              </>
            ) : null}
          </>
        )}

        {/* ── Media Tab ── */}
        {activeJobTab === 'media' && (
          <>
            {FILE_SECTIONS.map(({ type: sectionType, label }) => {
              const isDoc = sectionType === 'document';
              const photoField =
                sectionType === 'inspection' ? 'inspectionPhotos' : 'installPhotos';
              const photos: JobMedia[] = isDoc
                ? []
                : ((job as any)?.[photoField] ?? []).filter(
                    (p: any) => p && typeof p === 'object' && typeof p.id === 'string',
                  );
              const docFiles = isDoc
                ? ((job.files ?? []).filter(
                    (f: any) => f.type === 'document',
                  ) as JobFile[])
                : [];

              return (
                <View
                  key={sectionType}
                  style={[styles.mediaSection, !isDoc && styles.mediaSectionDivider]}
                >
                  <Typography
                    variant="label"
                    color={COLORS.textMuted}
                    style={styles.sectionLabel}
                  >
                    {label}
                  </Typography>

                  {isDoc ? (
                    <>
                      <Button
                        variant="secondary"
                        label={isUploading ? 'Uploading...' : '📄  Add Document'}
                        onPress={handleAddDocument}
                        isLoading={isUploading}
                      />
                      {docFiles.length > 0 ? (
                        <View style={styles.photoGrid}>
                          {docFiles.map((f) => (
                            <View key={f.id} style={styles.photoThumbWrapper}>
                              <Pressable
                                onPress={() => Linking.openURL(f.url)}
                                onLongPress={() => openFileModal(f)}
                              >
                                <View style={styles.docCard}>
                                  <Typography style={styles.docCardIcon}>📄</Typography>
                                  <Typography style={styles.docCardName} numberOfLines={3}>
                                    {f.name ?? 'Document'}
                                  </Typography>
                                  {f.isSharedWithCustomer && (
                                    <View style={styles.docSharedBadge}>
                                      <Typography style={styles.sharedBadgeText}>Shared</Typography>
                                    </View>
                                  )}
                                </View>
                              </Pressable>
                              <Pressable
                                style={styles.docDownloadBtn}
                                onPress={() =>
                                  handleDownloadMedia(
                                    f.url,
                                    f.name ?? `document_${f.id}`,
                                  )
                                }
                              >
                                <Typography style={styles.docDownloadBtnText}>
                                  ⬇  Download
                                </Typography>
                              </Pressable>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <Typography variant="caption" style={styles.emptyFiles}>
                          No documents yet.
                        </Typography>
                      )}
                    </>
                  ) : (
                    <>
                      <View style={styles.photoButtonRow}>
                        <Button
                          variant="secondary"
                          label="Camera 📷"
                          onPress={() =>
                            handleCameraPhoto(
                              photoField as 'inspectionPhotos' | 'installPhotos',
                            )
                          }
                          isLoading={isUploading}
                          style={{ flex: 1 }}
                        />
                        <Button
                          variant="secondary"
                          label="Gallery 📂"
                          onPress={() =>
                            handleGalleryPhoto(
                              photoField as 'inspectionPhotos' | 'installPhotos',
                            )
                          }
                          isLoading={isUploading}
                          style={{ flex: 1 }}
                        />
                      </View>
                      {photos.length > 0 ? (
                        <>
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{
                              gap: SPACING.sm,
                              marginTop: SPACING.sm,
                            }}
                          >
                            {photos.map((photo, i) => (
                              <Pressable
                                key={photo.id}
                                onPress={() => {
                                  setViewingMediaList(photos);
                                  setViewingMediaIdx(i);
                                }}
                                onLongPress={() => handleDeletePhoto(photo)}
                              >
                                <View>
                                  <Image
                                    source={{ uri: photo.url }}
                                    style={styles.photoHThumb}
                                  />
                                  {photo.shared && (
                                    <View style={styles.sharedBadge}>
                                      <Typography style={styles.sharedBadgeText}>Shared</Typography>
                                    </View>
                                  )}
                                </View>
                              </Pressable>
                            ))}
                          </ScrollView>
                          <Typography variant="caption" style={styles.photoHint}>
                            Tap to view  ·  Long press to delete
                          </Typography>
                        </>
                      ) : (
                        <Typography variant="caption" style={styles.emptyFiles}>
                          No {label.toLowerCase()} yet.
                        </Typography>
                      )}
                    </>
                  )}
                </View>
              );
            })}
          </>
        )}

      </ScrollView>

      {/* ── Full-Screen Photo Viewer ── */}
      <Modal
        visible={viewingMediaIdx !== null}
        transparent={false}
        animationType="fade"
        onRequestClose={() => setViewingMediaIdx(null)}
      >
        <View style={styles.viewerContainer}>
          <View style={styles.viewerHeader}>
            <Pressable
              onPress={() => setViewingMediaIdx(null)}
              hitSlop={12}
              style={styles.viewerHeaderBtn}
            >
              <Typography style={styles.viewerClose}>✕  Close</Typography>
            </Pressable>
            <Typography style={styles.viewerCounter}>
              {viewingMediaIdx !== null
                ? `${viewingMediaIdx + 1} / ${viewingMediaList.length}`
                : ''}
            </Typography>
            <Pressable
              onPress={() => {
                if (currentViewingMedia) openMediaModal(currentViewingMedia);
              }}
              hitSlop={12}
              style={styles.viewerHeaderBtn}
            >
              <Typography style={styles.viewerEdit}>Edit</Typography>
            </Pressable>
          </View>

          <FlatList
            data={viewingMediaList}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={viewingMediaIdx ?? 0}
            getItemLayout={(_, index) => ({
              length: SCREEN_WIDTH,
              offset: SCREEN_WIDTH * index,
              index,
            })}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            keyExtractor={(item) => item.id}
            style={styles.viewerFlatList}
            renderItem={({ item }) => (
              <ScrollView
                style={{ width: SCREEN_WIDTH }}
                contentContainerStyle={styles.viewerImageContainer}
                maximumZoomScale={5}
                minimumZoomScale={1}
                centerContent
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
              >
                <Image
                  source={{ uri: item.url }}
                  style={{ width: SCREEN_WIDTH, height: VIEWER_PHOTO_HEIGHT }}
                  resizeMode="contain"
                />
              </ScrollView>
            )}
          />

          <View style={styles.viewerFooter}>
            {currentViewingMedia?.shared && (
              <View style={styles.viewerSharedBadge}>
                <Typography style={styles.viewerSharedText}>Shared with Customer</Typography>
              </View>
            )}
            <Button
              variant="primary"
              label="⬇  Download to Phone"
              onPress={() => {
                if (currentViewingMedia) {
                  handleDownloadMedia(
                    currentViewingMedia.url,
                    `photo_${currentViewingMedia.id}.jpg`,
                  );
                }
              }}
            />
          </View>
        </View>
      </Modal>

      {/* ── Media Edit Modal ── */}
      <Modal
        visible={!!selectedMedia}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedMedia(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setSelectedMedia(null)}
        >
          <Pressable style={styles.fileModalSheet} onPress={() => {}}>
            <View style={styles.fileModalHeader}>
              <Typography variant="h3">Edit Photo</Typography>
              <Pressable onPress={() => setSelectedMedia(null)} hitSlop={12}>
                <Typography variant="h3" color={COLORS.textSecondary}>✕</Typography>
              </Pressable>
            </View>

            <View style={styles.switchRow}>
              <Typography variant="label">Share with Customer</Typography>
              <Switch
                value={editingMediaShared}
                onValueChange={setEditingMediaShared}
                trackColor={{ false: COLORS.border, true: COLORS.primaryLight }}
                thumbColor={editingMediaShared ? COLORS.primary : COLORS.background}
              />
            </View>

            <View style={styles.fileModalActions}>
              <Button
                variant="outline"
                label="Cancel"
                onPress={() => setSelectedMedia(null)}
                style={{ flex: 1 }}
              />
              <Button
                variant="primary"
                label="Save"
                onPress={handleUpdateMedia}
                isLoading={isUpdating}
                style={{ flex: 2 }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── File Edit Modal ── */}
      <Modal
        visible={!!selectedFile}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedFile(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setSelectedFile(null)}
        >
          <Pressable style={styles.fileModalSheet} onPress={() => {}}>
            <View style={styles.fileModalHeader}>
              <Typography variant="h3">Edit File</Typography>
              <Pressable onPress={() => setSelectedFile(null)} hitSlop={12}>
                <Typography variant="h3" color={COLORS.textSecondary}>✕</Typography>
              </Pressable>
            </View>

            <Typography variant="label" color={COLORS.textMuted} style={styles.sectionLabel}>
              Category
            </Typography>
            <View style={styles.catChipRow}>
              {FILE_SECTIONS.map(({ type: t, label }) => (
                <Pressable
                  key={t}
                  style={[styles.catChip, editingType === t && styles.catChipActive]}
                  onPress={() => setEditingType(t)}
                >
                  <Typography
                    style={[
                      styles.catChipText,
                      editingType === t && styles.catChipTextActive,
                    ]}
                  >
                    {label.replace(' Photos', '')}
                  </Typography>
                </Pressable>
              ))}
            </View>

            <View style={styles.switchRow}>
              <Typography variant="label">Share with Customer</Typography>
              <Switch
                value={editingShared}
                onValueChange={setEditingShared}
                trackColor={{ false: COLORS.border, true: COLORS.primaryLight }}
                thumbColor={editingShared ? COLORS.primary : COLORS.background}
              />
            </View>

            <Pressable
              style={styles.deleteDocBtn}
              onPress={() => {
                if (selectedFile) handleDeleteDocument(selectedFile);
              }}
            >
              <Typography variant="label" color={COLORS.danger}>
                Delete Document
              </Typography>
            </Pressable>

            <View style={styles.fileModalActions}>
              <Button
                variant="outline"
                label="Cancel"
                onPress={() => setSelectedFile(null)}
                style={{ flex: 1 }}
              />
              <Button
                variant="primary"
                label="Save"
                onPress={handleUpdateFile}
                isLoading={isUpdating}
                style={{ flex: 2 }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Edit Details Modal ── */}
      <Modal
        visible={isEditingDetails}
        animationType="slide"
        transparent
        onRequestClose={() => setIsEditingDetails(false)}
      >
        <View style={styles.editModalOverlay}>
          <View style={styles.editModalSheet}>
            <View style={styles.editModalHeader}>
              <Pressable onPress={() => setIsEditingDetails(false)}>
                <Typography variant="body" color={COLORS.textSecondary}>
                  Cancel
                </Typography>
              </Pressable>
              <Typography variant="h3">Edit Details</Typography>
              <Pressable onPress={handleSaveDetails} disabled={isUpdating}>
                <Typography
                  variant="body"
                  color={isUpdating ? COLORS.textDisabled : COLORS.primary}
                  style={{ fontWeight: FONT_WEIGHT.bold }}
                >
                  {isUpdating ? 'Saving…' : 'Save'}
                </Typography>
              </Pressable>
            </View>

            <ScrollView
              style={styles.editModalScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* ── Job Section ── */}
              <Typography
                variant="label"
                color={COLORS.textMuted}
                style={styles.editSectionLabel}
              >
                Job
              </Typography>

              <UITextInput
                label="Job Name"
                value={editForm.jobName ?? ''}
                onChangeText={(t) => setEditForm((p) => ({ ...p, jobName: t }))}
                placeholder="Job name"
              />

              <Typography variant="label" color={COLORS.textMuted} style={styles.inputGroupLabel}>
                Job Type
              </Typography>
              <View style={styles.chipRow}>
                {(['Retail', 'Insurance'] as const).map((type) => (
                  <Pressable
                    key={type}
                    style={[styles.typeChip, editForm.jobType === type && styles.typeChipActive]}
                    onPress={() => setEditForm((p) => ({ ...p, jobType: type }))}
                  >
                    <Typography
                      style={[
                        styles.typeChipText,
                        editForm.jobType === type && styles.typeChipTextActive,
                      ]}
                    >
                      {type}
                    </Typography>
                  </Pressable>
                ))}
              </View>

              <Typography variant="label" color={COLORS.textMuted} style={styles.inputGroupLabel}>
                Trades
              </Typography>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.md }}>
                {AVAILABLE_TRADES.map((trade) => {
                  const isActive = editForm?.trades?.includes(trade);
                  return (
                    <Pressable
                      key={trade}
                      style={[styles.typeChip, isActive && styles.typeChipActive]}
                      onPress={() =>
                        setEditForm((p) => {
                          const current = p.trades ?? [];
                          return {
                            ...p,
                            trades: current.includes(trade)
                              ? current.filter((t) => t !== trade)
                              : [...current, trade],
                          };
                        })
                      }
                    >
                      <Typography
                        style={[
                          styles.typeChipText,
                          isActive && styles.typeChipTextActive,
                        ]}
                      >
                        {trade}
                      </Typography>
                    </Pressable>
                  );
                })}
              </View>

              <UITextInput
                label="Measurements"
                value={editForm.measurements ?? ''}
                onChangeText={(t) => setEditForm((p) => ({ ...p, measurements: t }))}
                placeholder="Square footage, etc."
              />

              <UITextInput
                label="Description"
                value={editForm.jobDescription ?? ''}
                onChangeText={(t) => setEditForm((p) => ({ ...p, jobDescription: t }))}
                placeholder="Job description"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                containerStyle={styles.multilineContainer}
              />

              <UITextInput
                label="Job Notes"
                value={editForm.jobNotes ?? ''}
                onChangeText={(t) => setEditForm((p) => ({ ...p, jobNotes: t }))}
                placeholder="Internal notes"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                containerStyle={styles.multilineContainer}
              />

              {/* ── Financials Section ── */}
              <Typography
                variant="label"
                color={COLORS.textMuted}
                style={styles.editSectionLabel}
              >
                Financials
              </Typography>

              <UITextInput
                label="Contract Amount ($)"
                value={editForm.contractAmount ? String(editForm.contractAmount) : ''}
                onChangeText={(t) =>
                  setEditForm((p) => ({
                    ...p,
                    contractAmount: parseFloat(t.replace(/[^0-9.]/g, '')) || 0,
                  }))
                }
                keyboardType="decimal-pad"
                placeholder="0.00"
              />

              <UITextInput
                label="Deposit Amount ($)"
                value={editForm.depositAmount ? String(editForm.depositAmount) : ''}
                onChangeText={(t) =>
                  setEditForm((p) => ({
                    ...p,
                    depositAmount: parseFloat(t.replace(/[^0-9.]/g, '')) || 0,
                  }))
                }
                keyboardType="decimal-pad"
                placeholder="0.00"
              />

              {/* ── Insurance Section ── */}
              <Typography
                variant="label"
                color={COLORS.textMuted}
                style={styles.editSectionLabel}
              >
                Insurance
              </Typography>

              <UITextInput
                label="Carrier"
                value={editForm.carrier ?? ''}
                onChangeText={(t) => setEditForm((p) => ({ ...p, carrier: t }))}
                placeholder="Insurance carrier"
              />

              <UITextInput
                label="Claim #"
                value={editForm.claimNumber ?? ''}
                onChangeText={(t) => setEditForm((p) => ({ ...p, claimNumber: t }))}
                placeholder="Claim number"
              />

              <UITextInput
                label="Deductible ($)"
                value={editForm.deductible ? String(editForm.deductible) : ''}
                onChangeText={(t) =>
                  setEditForm((p) => ({
                    ...p,
                    deductible: parseFloat(t.replace(/[^0-9.]/g, '')) || 0,
                  }))
                }
                keyboardType="decimal-pad"
                placeholder="0.00"
              />

              <UITextInput
                label="Adjuster Name"
                value={editForm.adjusterName ?? ''}
                onChangeText={(t) => setEditForm((p) => ({ ...p, adjusterName: t }))}
                placeholder="Adjuster full name"
              />

              <UITextInput
                label="Adjuster Phone"
                value={editForm.adjusterPhone ?? ''}
                onChangeText={(t) =>
                  setEditForm((p) => ({ ...p, adjusterPhone: maskPhone(t) }))
                }
                keyboardType="phone-pad"
                placeholder="(###) ###-####"
              />

              <UITextInput
                label="Adjuster Email"
                value={editForm.adjusterEmail ?? ''}
                onChangeText={(t) => setEditForm((p) => ({ ...p, adjusterEmail: t }))}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="Email address"
              />

              <UITextInput
                label="Date of Loss"
                value={editForm.dateOfLoss ?? ''}
                onChangeText={(t) =>
                  setEditForm((p) => ({ ...p, dateOfLoss: maskDate(t) }))
                }
                keyboardType="numeric"
                placeholder="MM/DD/YYYY"
              />

              <UITextInput
                label="Date of Discovery"
                value={editForm.dateOfDiscovery ?? ''}
                onChangeText={(t) =>
                  setEditForm((p) => ({ ...p, dateOfDiscovery: maskDate(t) }))
                }
                keyboardType="numeric"
                placeholder="MM/DD/YYYY"
              />

              <View style={{ height: SPACING.xxxl }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Add Job Modal ── */}
      <Modal
        visible={isAddingJobModal}
        transparent
        animationType="fade"
        onRequestClose={() => setIsAddingJobModal(false)}
      >
        <View style={styles.paymentModalOverlay}>
          <View style={styles.paymentModalCard}>
            <Typography variant="h3" style={{ marginBottom: SPACING.sm }}>
              New Job
            </Typography>

            <UITextInput
              label="Job Name"
              value={newJobForm.jobName}
              onChangeText={(t) => setNewJobForm((p) => ({ ...p, jobName: t }))}
              placeholder="e.g. Roof Replacement"
              autoFocus
            />

            <Typography variant="label" color={COLORS.textMuted} style={styles.inputGroupLabel}>
              Job Type
            </Typography>
            <View style={[styles.chipRow, { marginBottom: SPACING.md }]}>
              {(['Retail', 'Insurance'] as const).map((type) => (
                <Pressable
                  key={type}
                  style={[styles.typeChip, newJobForm.jobType === type && styles.typeChipActive]}
                  onPress={() => setNewJobForm((p) => ({ ...p, jobType: type }))}
                >
                  <Typography
                    style={[
                      styles.typeChipText,
                      newJobForm.jobType === type && styles.typeChipTextActive,
                    ]}
                  >
                    {type}
                  </Typography>
                </Pressable>
              ))}
            </View>

            <View style={[styles.fileModalActions, { marginTop: SPACING.sm }]}>
              <Button
                variant="outline"
                label="Cancel"
                onPress={() => setIsAddingJobModal(false)}
                style={{ flex: 1 }}
              />
              <Button
                variant="primary"
                label="Create Job"
                onPress={handleConfirmAddJob}
                isLoading={isCreatingJob}
                style={{ flex: 2 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Add Payment Modal ── */}
      <Modal
        visible={isAddingPayment}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setIsAddingPayment(false);
          setNewPaymentAmount('');
        }}
      >
        <View style={styles.paymentModalOverlay}>
          <View style={styles.paymentModalCard}>
            <Typography variant="h3" style={{ marginBottom: SPACING.sm }}>
              Add Payment
            </Typography>
            <UITextInput
              label="Amount ($)"
              value={newPaymentAmount}
              onChangeText={setNewPaymentAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              autoFocus
            />
            <View style={[styles.fileModalActions, { marginTop: SPACING.md }]}>
              <Button
                variant="outline"
                label="Cancel"
                onPress={() => {
                  setIsAddingPayment(false);
                  setNewPaymentAmount('');
                }}
                style={{ flex: 1 }}
              />
              <Button
                variant="primary"
                label="Save Payment"
                onPress={handleSavePayment}
                isLoading={isUpdating}
                style={{ flex: 2 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ─── Row sub-component ────────────────────────────────────────────────────────

function Row({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  if (!value) return null;
  return (
    <View style={rowStyles.container}>
      <Typography
        variant="label"
        color={COLORS.textMuted}
        style={{ flex: 1 }}
      >
        {label}
      </Typography>
      <Typography
        variant="body"
        color={COLORS.textPrimary}
        numberOfLines={3}
        style={[
          { flex: 2, textAlign: 'right' },
          mono && { fontFamily: 'monospace', fontSize: FONT_SIZE.sm },
        ]}
      >
        {value}
      </Typography>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxxl,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Section label (uppercase caption above each section)
  sectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },

  // Card overrides — horizontal padding, minimal vertical padding for rows
  infoCard: {
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.xs,
  },

  // Pipeline status chips
  pipelineRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
    paddingHorizontal: 2,
  },
  pipelineChip: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: 14,
    borderRadius: RADIUS.round,
    borderWidth: 1.5,
  },
  pipelineChipDisabled: {
    opacity: 0.5,
  },
  pipelineChipText: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
  },

  // Financials
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.sm,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },

  // Media sections
  mediaSection: {
    marginBottom: SPACING.xl,
  },
  mediaSectionDivider: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    paddingBottom: SPACING.base,
  },
  photoButtonRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  photoThumbWrapper: {
    position: 'relative',
  },
  sharedBadge: {
    position: 'absolute',
    bottom: SPACING.xs,
    left: SPACING.xs,
    backgroundColor: 'rgba(46,125,50,0.85)',
    paddingHorizontal: SPACING.sm - 2,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  sharedBadgeText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.white,
  },
  emptyFiles: {
    fontStyle: 'italic',
    marginTop: SPACING.sm,
  },

  // Document grid cards
  docCard: {
    width: 100,
    height: 100,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.secondaryBg,
    borderWidth: 1,
    borderColor: COLORS.secondaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.sm,
    gap: SPACING.xs,
  },
  docCardIcon: {
    fontSize: 28,
  },
  docCardName: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.secondaryDark,
    textAlign: 'center',
  },
  docSharedBadge: {
    position: 'absolute',
    bottom: SPACING.xs,
    left: SPACING.xs,
    backgroundColor: 'rgba(46,125,50,0.85)',
    paddingHorizontal: SPACING.sm - 2,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  docDownloadBtn: {
    backgroundColor: COLORS.secondaryBg,
    borderRadius: RADIUS.sm,
    paddingVertical: 5,
    paddingHorizontal: SPACING.sm,
    alignItems: 'center',
    marginTop: SPACING.xs,
    width: 100,
  },
  docDownloadBtnText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.secondaryDark,
  },

  // Horizontal photo strip
  photoHThumb: {
    width: 80,
    height: 80,
    borderRadius: RADIUS.md,
  },
  photoHint: {
    fontStyle: 'italic',
    marginTop: SPACING.sm,
  },

  // ── Full-Screen Viewer ──
  viewerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  viewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: 56,
    paddingBottom: SPACING.md,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  viewerHeaderBtn: {
    minWidth: 64,
  },
  viewerClose: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.white,
  },
  viewerCounter: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
    color: 'rgba(255,255,255,0.7)',
  },
  viewerEdit: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.primaryLight,
    textAlign: 'right',
  },
  viewerFlatList: {
    flex: 1,
  },
  viewerImageContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  viewerFooter: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: 36,
    backgroundColor: 'rgba(0,0,0,0.6)',
    gap: SPACING.sm,
  },
  viewerSharedBadge: {
    alignSelf: 'center',
    backgroundColor: 'rgba(46,125,50,0.85)',
    paddingHorizontal: 14,
    paddingVertical: SPACING.xs,
    borderRadius: SPACING.md,
  },
  viewerSharedText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.white,
  },

  // ── Bottom Sheet Modals ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  fileModalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: SPACING.lg,
    paddingBottom: 36,
    gap: SPACING.md,
  },
  fileModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fileModalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
  },

  // Category chips (File edit modal)
  catChipRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  catChip: {
    paddingVertical: 9,
    paddingHorizontal: SPACING.base,
    borderRadius: RADIUS.round,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  catChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  catChipText: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textSecondary,
  },
  catChipTextActive: {
    color: COLORS.white,
  },

  // Switch row
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 14,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: SPACING.md,
  },

  // Delete document button
  deleteDocBtn: {
    paddingVertical: 14,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.danger,
    alignItems: 'center',
  },

  // ── Edit Details Modal ──
  editModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  editModalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '92%',
  },
  editModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.base,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  editModalScroll: {
    paddingHorizontal: SPACING.lg,
  },
  editSectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: SPACING.xl,
    marginBottom: SPACING.xs,
  },
  inputGroupLabel: {
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  multilineContainer: {
    marginTop: SPACING.xs,
  },
  chipRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
  },
  typeChip: {
    paddingVertical: 9,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.round,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  typeChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  typeChipText: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textSecondary,
  },
  typeChipTextActive: {
    color: COLORS.white,
  },

  // ── Customer's Projects ──
  projectsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm - 2,
    paddingHorizontal: 2,
  },
  projectPill: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.xl,
    borderWidth: 1.5,
    alignItems: 'center',
    minWidth: 80,
    gap: 2,
  },
  projectPillDate: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textMuted,
  },
  projectPillStatus: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  projectPillCurrentDot: {
    width: 5,
    height: 5,
    borderRadius: RADIUS.round,
    backgroundColor: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  projectPillAdd: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.textDisabled,
    borderStyle: 'dashed',
    justifyContent: 'center',
  },
  projectPillAddText: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textSecondary,
  },

  // ── Job Tabs ──
  jobTabRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.base,
    marginBottom: SPACING.xs,
  },
  jobTabBtn: {
    flex: 1,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    backgroundColor: COLORS.borderLight,
  },
  jobTabBtnActive: {
    backgroundColor: COLORS.secondary,
  },
  jobTabBtnText: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textMuted,
  },
  jobTabBtnTextActive: {
    color: COLORS.white,
  },

  // ── Add Payment Modal ──
  paymentModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  paymentModalCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: SPACING.xl,
    width: '100%',
    gap: SPACING.xs,
  },
});
