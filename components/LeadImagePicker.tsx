import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { uploadLeadFile } from '../services';
import { useUploadQueue } from '../hooks/useUploadQueue';
import type { JobMedia, LeadFile } from '../types';
import { Button, Typography } from './ui';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '../constants/theme';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = ['Inspection', 'Install', 'Documents'] as const;
type Category = (typeof CATEGORIES)[number];

const PDF_CATEGORIES = new Set<Category>(['Documents']);

/** Maps folder category names to the JobMedia category value. */
const PHOTO_CATEGORY_MAP: Partial<Record<Category, JobMedia['category']>> = {
  Inspection: 'inspection',
  Install: 'install',
};

// ─── Pure helper (outside component — stable reference, no closure issues) ────

/**
 * Projects the internal LeadFile list into the JobMedia shape for the parent.
 * Kept outside the component so it never needs to appear in a useEffect dep array.
 */
function toJobMedia(currentFiles: LeadFile[]): JobMedia[] {
  return currentFiles
    .filter(
      (f) => f.type === 'image' && PHOTO_CATEGORY_MAP[f.category as Category] !== undefined,
    )
    .map((f) => ({
      id: f.id,
      url: f.url,
      category: PHOTO_CATEGORY_MAP[f.category as Category]!,
      shared: f.isPublic,
      uploadedAt: new Date(f.createdAt).toISOString(),
    }));
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string;
  onUpdate: (media: JobMedia[], permissions: Record<string, boolean>) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LeadImagePicker({ companyId, onUpdate }: Props) {
  const [files, setFiles] = useState<LeadFile[]>([]);
  const [folderPermissions, setFolderPermissions] = useState<Record<string, boolean>>(
    () => Object.fromEntries(CATEGORIES.map((c) => [c, false])),
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    () => Object.fromEntries(CATEGORIES.map((c) => [c, false])),
  );

  // One queue per category — lets each folder show its own in-flight progress.
  const inspectionQueue = useUploadQueue();
  const installQueue = useUploadQueue();
  const documentsQueue = useUploadQueue();

  const queueForCategory = (cat: string) => {
    if (cat === 'Inspection') return inspectionQueue;
    if (cat === 'Install') return installQueue;
    return documentsQueue;
  };

  // ─── Parent sync via useEffect ────────────────────────────────────────────
  //
  // ALL calls to onUpdate live here — never inside render, never inside a
  // setFiles functional updater, never inside an async uploadFn.
  // Using a ref for onUpdate avoids adding a potentially-unstable prop function
  // to the dependency array (which would cause the effect to re-run every render
  // if the parent doesn't memoise it).

  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate; // always up to date, no dep-array churn

  useEffect(() => {
    onUpdateRef.current(toJobMedia(files), folderPermissions);
  }, [files, folderPermissions]);

  // ─── Handlers ────────────────────────────────────────────────────────────────
  //
  // These only mutate local state. The useEffect above takes care of propagating
  // changes to the parent, so no onUpdate call is needed here.

  const toggleExpanded = (cat: string) =>
    setExpanded((prev) => ({ ...prev, [cat]: !prev[cat] }));

  const toggleFolderPermission = (cat: string, value: boolean) => {
    setFolderPermissions((prev) => ({ ...prev, [cat]: value }));
    // Bulk-update all existing files in this folder to match the new folder toggle.
    setFiles((prev) => prev.map((f) => (f.category === cat ? { ...f, isPublic: value } : f)));
  };

  const toggleFilePublic = (fileId: string, value: boolean) =>
    setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, isPublic: value } : f)));

  const deleteFile = (fileId: string) =>
    setFiles((prev) => prev.filter((f) => f.id !== fileId));

  // ─── Upload helpers ───────────────────────────────────────────────────────

  /**
   * Builds a single queue task for one file.
   * The uploadFn ONLY calls setFiles — it never calls onUpdate directly, which
   * would risk a "setState during render" error if React batches the calls.
   * The useEffect above handles propagating the new files list to the parent.
   */
  const buildTask = (
    category: string,
    sourceUri: string,
    rawFilename: string | undefined,
    fileType: 'image' | 'pdf',
    taskId: string,
    timestamp: number,
  ) => {
    const ext = fileType === 'pdf' ? 'pdf' : 'jpg';
    const prefix = fileType === 'pdf' ? 'document' : 'photo';
    const filename = rawFilename ?? `${prefix}_${timestamp}.${ext}`;
    // Capture folderPermissions at enqueue time — this is intentional so that
    // the file's initial isPublic reflects the toggle state when the user pressed the button.
    const isPublicAtEnqueue = folderPermissions[category] ?? false;

    return {
      id: taskId,
      sourceUri,
      uploadFn: async (uri: string, onProgress: (p: number) => void) => {
        const url = await uploadLeadFile(companyId, category, uri, filename, onProgress);
        const newFile: LeadFile = {
          id: taskId,
          url,
          name: filename,
          type: fileType,
          category,
          isPublic: isPublicAtEnqueue,
          createdAt: timestamp,
          companyId,
        };
        // Plain functional updater — no side-effects, no onUpdate call here.
        setFiles((prev) => [...prev, newFile]);
      },
    };
  };

  const pickFromCamera = async (category: string) => {
    const permResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permResult.granted) {
      Alert.alert('Permission Required', 'Please allow camera access to take photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    const timestamp = Date.now();
    const taskId = `${timestamp}_cam`;
    queueForCategory(category).enqueue([
      buildTask(category, asset.uri, asset.fileName ?? undefined, 'image', taskId, timestamp),
    ]);
  };

  const pickFromGallery = async (category: string) => {
    const permResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permResult.granted) {
      Alert.alert('Permission Required', 'Please allow photo access to upload files.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.length) return;

    const timestamp = Date.now();
    queueForCategory(category).enqueue(
      result.assets.map((asset, i) =>
        buildTask(
          category,
          asset.uri,
          asset.fileName ?? undefined,
          'image',
          `${timestamp}_${i}`,
          timestamp + i,
        ),
      ),
    );
  };

  const pickDocument = async (category: string) => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    const timestamp = Date.now();
    const taskId = `${timestamp}_doc`;
    queueForCategory(category).enqueue([
      buildTask(category, asset.uri, asset.name ?? undefined, 'pdf', taskId, timestamp),
    ]);
  };

  const categoryFiles = (cat: string) => files.filter((f) => f.category === cat);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {CATEGORIES.map((cat) => {
        const catFiles = categoryFiles(cat);
        const isExpanded = expanded[cat];
        const isPdfCategory = PDF_CATEGORIES.has(cat);
        const catQueue = queueForCategory(cat);
        const catQueueItems = catQueue.items;
        const hasContent = catFiles.length > 0 || catQueueItems.length > 0;

        return (
          <View key={cat} style={styles.folder}>

            {/* Folder header */}
            <Pressable style={styles.folderHeader} onPress={() => toggleExpanded(cat)}>
              <View style={styles.folderHeaderLeft}>
                <Typography style={styles.folderArrow}>{isExpanded ? '▼' : '▶'}</Typography>
                <Typography style={styles.folderName}>
                  {cat} ({catFiles.length + catQueueItems.length})
                </Typography>
              </View>
              {!isPdfCategory && (
                <View style={styles.folderHeaderRight}>
                  <Typography style={styles.shareLabel}>Share</Typography>
                  <Switch
                    value={folderPermissions[cat]}
                    onValueChange={(v) => toggleFolderPermission(cat, v)}
                    trackColor={{ false: COLORS.border, true: COLORS.primaryLight }}
                    thumbColor={folderPermissions[cat] ? COLORS.primary : COLORS.textDisabled}
                  />
                </View>
              )}
            </Pressable>

            {/* Folder body */}
            {isExpanded && (
              <View style={styles.folderBody}>

                {/* Camera + Gallery buttons */}
                <View style={styles.actionRow}>
                  <Button
                    variant="outline"
                    size="sm"
                    label="Camera 📷"
                    onPress={() => pickFromCamera(cat)}
                    style={styles.addPhotoButton}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    label="Gallery 📂"
                    onPress={() => pickFromGallery(cat)}
                    style={styles.addPhotoButton}
                  />
                </View>

                {/* PDF button — Documents folder only */}
                {isPdfCategory && (
                  <Button
                    variant="outline"
                    size="sm"
                    label="+ Add PDF"
                    onPress={() => pickDocument(cat)}
                    style={styles.addDocButton}
                  />
                )}

                {/* Horizontal strip — confirmed files + in-flight queue items */}
                {hasContent && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.photoScrollContent}
                  >
                    {/* Confirmed uploaded files */}
                    {catFiles.map((file) => (
                      <View key={file.id} style={styles.photoItem}>
                        {file.type === 'pdf' ? (
                          <View style={styles.pdfThumbnail}>
                            <Typography style={styles.pdfIcon}>PDF</Typography>
                            <Typography style={styles.pdfName} numberOfLines={2}>
                              {file.name}
                            </Typography>
                          </View>
                        ) : (
                          <Image
                            source={{ uri: file.url }}
                            style={styles.thumbnail}
                            contentFit="cover"
                            cachePolicy="disk"
                          />
                        )}
                        <View style={styles.photoControls}>
                          <View style={styles.photoShareRow}>
                            <Typography style={styles.photoShareLabel}>Share</Typography>
                            <Switch
                              value={file.isPublic}
                              onValueChange={(v) => toggleFilePublic(file.id, v)}
                              trackColor={{ false: COLORS.border, true: COLORS.primaryLight }}
                              thumbColor={file.isPublic ? COLORS.primary : COLORS.textDisabled}
                              style={styles.smallSwitch}
                            />
                          </View>
                          <Button
                            variant="ghost"
                            size="sm"
                            label="Delete"
                            onPress={() => deleteFile(file.id)}
                            style={styles.deleteButton}
                          />
                        </View>
                      </View>
                    ))}

                    {/* In-flight queue items — local preview with status overlay */}
                    {catQueueItems.map((item) => (
                      <View key={item.id} style={styles.queueItem}>
                        <Image
                          source={{ uri: item.cachedUri }}
                          style={[
                            styles.thumbnail,
                            { opacity: item.status === 'failed' ? 0.35 : 0.6 },
                          ]}
                          contentFit="cover"
                        />
                        {(item.status === 'pending' || item.status === 'uploading') && (
                          <View style={styles.uploadOverlay}>
                            {item.status === 'uploading' ? (
                              <Typography style={styles.uploadProgress}>
                                {Math.round(item.progress * 100)}%
                              </Typography>
                            ) : (
                              <ActivityIndicator size="small" color={COLORS.white} />
                            )}
                          </View>
                        )}
                        {item.status === 'failed' && (
                          <Pressable
                            style={styles.retryOverlay}
                            onPress={() => catQueue.retryUpload(item.id)}
                          >
                            <Typography style={styles.retryLabel}>↺ Retry</Typography>
                          </Pressable>
                        )}
                      </View>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: SPACING.sm,
  },

  folder: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  folderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    backgroundColor: COLORS.background,
  },
  folderHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  folderArrow: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
  },
  folderName: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textPrimary,
  },
  folderHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  shareLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
  },

  folderBody: {
    padding: SPACING.md,
    gap: SPACING.md,
  },

  actionRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  addPhotoButton: {
    flex: 1,
    borderStyle: 'dashed',
    backgroundColor: COLORS.primaryBg,
  },
  addDocButton: {
    borderStyle: 'dashed',
    borderColor: COLORS.secondary,
    backgroundColor: COLORS.secondaryBg,
  },

  pdfThumbnail: {
    width: 90,
    height: 80,
    backgroundColor: COLORS.secondaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xs,
  },
  pdfIcon: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.heavy,
    color: COLORS.danger,
    marginBottom: 2,
  },
  pdfName: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },

  photoScrollContent: {
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  photoItem: {
    width: 90,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  thumbnail: {
    width: 90,
    height: 80,
  },
  photoControls: {
    padding: SPACING.xs,
    gap: 2,
  },
  photoShareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  photoShareLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
  },
  smallSwitch: {
    transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }],
  },
  deleteButton: {
    alignSelf: 'center',
  },

  queueItem: {
    width: 90,
    height: 80,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    position: 'relative',
  },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadProgress: {
    color: COLORS.white,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.bold,
  },
  retryOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(180,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryLabel: {
    color: COLORS.white,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.bold,
  },
});
