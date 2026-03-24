/**
 * ReportGeneratorModal — full-screen photo selector for PDF report generation.
 *
 * Shows all confirmed (non-pending) inspection + install photos in a 3-column
 * grid. User selects photos, then taps "Generate (X)" to fire off the PDF
 * generation in the background. The modal closes immediately and the finished
 * report appears in the job's Documents section once the upload completes.
 */

import { useMemo, useState } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import { COLLECTIONS } from '../constants/config';
import { generateJobReport } from '../services/pdfService';
import { Button, Typography } from './ui';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SHADOW, SPACING } from '../constants/theme';
import type { Job, JobMedia } from '../types/job';
import type { Customer } from '../types/customer';

// ─── Constants ────────────────────────────────────────────────────────────────

const NUM_COLUMNS = 3;
const GRID_PADDING = SPACING.base;
const CELL_GAP = SPACING.sm;
const THUMB_SIZE =
  (Dimensions.get('window').width - GRID_PADDING * 2 - CELL_GAP * (NUM_COLUMNS - 1)) /
  NUM_COLUMNS;

// ─── Props ────────────────────────────────────────────────────────────────────

interface ReportGeneratorModalProps {
  visible: boolean;
  onClose: () => void;
  job: Job;
  customer: Customer;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReportGeneratorModal({
  visible,
  onClose,
  job,
  customer,
}: ReportGeneratorModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Combine both photo arrays; exclude items still uploading (pending_ prefix).
  const allMedia: JobMedia[] = useMemo(() => {
    const inspection = (job.inspectionPhotos ?? []) as JobMedia[];
    const install = (job.installPhotos ?? []) as JobMedia[];
    return [...inspection, ...install].filter(
      (p) => p && typeof p.id === 'string' && !p.id.startsWith('pending_'),
    );
  }, [job.inspectionPhotos, job.installPhotos]);

  const allSelected = allMedia.length > 0 && selectedIds.size === allMedia.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allMedia.map((p) => p.id)));
    }
  };

  const togglePhoto = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleGenerate = () => {
    const selectedMedia = allMedia.filter((p) => selectedIds.has(p.id));
    if (selectedMedia.length === 0) {
      Alert.alert('No Photos Selected', 'Please select at least one photo to generate a report.');
      return;
    }

    // Fire-and-forget — modal closes immediately; report uploads in the background.
    (async () => {
      const companySnap = await getDoc(doc(db, COLLECTIONS.companies, job.companyId));
      const logoUrl: string | undefined = companySnap.data()?.logoUrl ?? undefined;
      await generateJobReport(job, customer, selectedMedia, logoUrl);
    })().catch(console.error);

    Alert.alert(
      'Generating',
      'The report is generating in the background and will appear in Documents shortly.',
    );

    setSelectedIds(new Set());
    onClose();
  };

  const handleClose = () => {
    setSelectedIds(new Set());
    onClose();
  };

  // ── Render item ────────────────────────────────────────────────────────────

  const renderItem = ({ item, index }: { item: JobMedia; index: number }) => {
    const isSelected = selectedIds.has(item.id);
    const isLastInRow = (index + 1) % NUM_COLUMNS === 0;

    return (
      <Pressable
        onPress={() => togglePhoto(item.id)}
        style={[styles.thumbWrapper, !isLastInRow && { marginRight: CELL_GAP }]}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isSelected }}
        accessibilityLabel={`Photo ${index + 1}${item.comment ? `: ${item.comment}` : ''}`}
      >
        <Image
          source={{ uri: item.url }}
          style={styles.thumb}
          contentFit="cover"
          cachePolicy="disk"
        />

        {/* Selection overlay */}
        {isSelected && (
          <View style={styles.selectedOverlay}>
            <View style={styles.checkCircle}>
              <Typography style={styles.checkMark}>✓</Typography>
            </View>
          </View>
        )}

        {/* Unselected dim */}
        {!isSelected && <View style={styles.unselectedOverlay} />}

        {/* Category badge */}
        <View
          style={[
            styles.categoryBadge,
            item.category === 'inspection'
              ? styles.categoryBadgeInspection
              : styles.categoryBadgeInstall,
          ]}
        >
          <Typography style={styles.categoryBadgeText}>
            {item.category === 'inspection' ? 'Insp' : 'Inst'}
          </Typography>
        </View>
      </Pressable>
    );
  };

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.container}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <Pressable onPress={handleClose} hitSlop={12} style={styles.headerSideBtn}>
            <Typography style={styles.headerCancelText}>Cancel</Typography>
          </Pressable>

          <Typography style={styles.headerTitle}>Generate Report</Typography>

          <Pressable
            onPress={handleGenerate}
            disabled={selectedIds.size === 0}
            hitSlop={8}
            style={styles.headerSideBtn}
          >
            <Typography
              style={[
                styles.headerGenerateText,
                selectedIds.size === 0 && { color: COLORS.textDisabled },
              ]}
            >
              Generate {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
            </Typography>
          </Pressable>
        </View>

        {/* ── Sub-header: Select All / Deselect All ── */}
        <View style={styles.subHeader}>
          <Typography style={styles.subHeaderCount}>
            {allMedia.length} photo{allMedia.length !== 1 ? 's' : ''} available
          </Typography>
          <Pressable onPress={toggleSelectAll} hitSlop={10} disabled={allMedia.length === 0}>
            <Typography
              style={[
                styles.selectAllText,
                allMedia.length === 0 && { color: COLORS.textDisabled },
              ]}
            >
              {allSelected ? 'Deselect All' : 'Select All'}
            </Typography>
          </Pressable>
        </View>

        {/* ── Photo Grid ── */}
        {allMedia.length === 0 ? (
          <View style={styles.emptyState}>
            <Typography style={styles.emptyStateIcon}>🖼️</Typography>
            <Typography style={styles.emptyStateTitle}>No Photos Yet</Typography>
            <Typography style={styles.emptyStateBody}>
              Upload inspection or install photos to include them in a report.
            </Typography>
          </View>
        ) : (
          <FlatList
            data={allMedia}
            keyExtractor={(item) => item.id}
            numColumns={NUM_COLUMNS}
            renderItem={renderItem}
            contentContainerStyle={styles.grid}
            showsVerticalScrollIndicator={false}
            columnWrapperStyle={styles.columnWrapper}
          />
        )}

        {/* ── Bottom action bar (shown when photos exist) ── */}
        {allMedia.length > 0 && (
          <View style={styles.footer}>
            <Button
              variant="primary"
              label={
                selectedIds.size === 0
                  ? 'Select Photos to Generate'
                  : `Generate PDF  (${selectedIds.size} photo${selectedIds.size !== 1 ? 's' : ''})`
              }
              onPress={handleGenerate}
              disabled={selectedIds.size === 0}
            />
          </View>
        )}

      </SafeAreaView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    ...SHADOW.sm,
  },
  headerSideBtn: {
    minWidth: 80,
  },
  headerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
    textAlign: 'center',
    flex: 1,
  },
  headerCancelText: {
    fontSize: FONT_SIZE.base,
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHT.medium,
  },
  headerGenerateText: {
    fontSize: FONT_SIZE.base,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHT.bold,
    textAlign: 'right',
  },

  // ── Sub-header ──
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  subHeaderCount: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
    fontWeight: FONT_WEIGHT.medium,
  },
  selectAllText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHT.semibold,
  },

  // ── Grid ──
  grid: {
    padding: GRID_PADDING,
    paddingBottom: SPACING.xxxl,
  },
  columnWrapper: {
    marginBottom: CELL_GAP,
  },
  thumbWrapper: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    position: 'relative',
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
  },

  // ── Selection overlays ──
  selectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(46, 125, 50, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW.sm,
  },
  checkMark: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textInverse,
    fontWeight: FONT_WEIGHT.bold,
    lineHeight: 18,
  },
  unselectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
  },

  // ── Category badge ──
  categoryBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  categoryBadgeInspection: {
    backgroundColor: 'rgba(25, 118, 210, 0.80)',
  },
  categoryBadgeInstall: {
    backgroundColor: 'rgba(46, 125, 50, 0.80)',
  },
  categoryBadgeText: {
    fontSize: 9,
    color: COLORS.textInverse,
    fontWeight: FONT_WEIGHT.bold,
    letterSpacing: 0.3,
  },

  // ── Empty state ──
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xxl,
    gap: SPACING.sm,
  },
  emptyStateIcon: {
    fontSize: 48,
  },
  emptyStateTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  emptyStateBody: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── Footer ──
  footer: {
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    ...SHADOW.md,
  },
});
