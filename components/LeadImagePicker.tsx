import { useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { uploadLeadFile } from '../services';
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
  const [uploading, setUploading] = useState<string | null>(null);

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /** Projects the internal LeadFile list into the JobMedia shape for the parent. */
  const toJobMedia = (currentFiles: LeadFile[]): JobMedia[] =>
    currentFiles
      .filter((f) => f.type === 'image' && PHOTO_CATEGORY_MAP[f.category as Category] !== undefined)
      .map((f) => ({
        id: f.id,
        url: f.url,
        category: PHOTO_CATEGORY_MAP[f.category as Category]!,
        shared: f.isPublic,
        uploadedAt: new Date(f.createdAt).toISOString(),
      }));

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const toggleExpanded = (cat: string) => {
    setExpanded((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const toggleFolderPermission = (cat: string, value: boolean) => {
    const next = { ...folderPermissions, [cat]: value };
    setFolderPermissions(next);
    onUpdate(toJobMedia(files), next);
  };

  const toggleFilePublic = (fileId: string, value: boolean) => {
    const next = files.map((f) => (f.id === fileId ? { ...f, isPublic: value } : f));
    setFiles(next);
    onUpdate(toJobMedia(next), folderPermissions);
  };

  const deleteFile = (fileId: string) => {
    const next = files.filter((f) => f.id !== fileId);
    setFiles(next);
    onUpdate(toJobMedia(next), folderPermissions);
  };

  /** Core upload logic shared by camera, gallery, and document pickers. */
  const processAndUpload = async (
    category: string,
    uri: string,
    rawFilename: string | undefined,
    fileType: 'image' | 'pdf',
  ) => {
    const timestamp = Date.now();
    const ext = fileType === 'pdf' ? 'pdf' : 'jpg';
    const prefix = fileType === 'pdf' ? 'document' : 'photo';
    const filename = rawFilename ?? `${prefix}_${timestamp}.${ext}`;

    setUploading(category);
    try {
      const url = await uploadLeadFile(companyId, category, uri, filename);
      const newFile: LeadFile = {
        id: timestamp.toString(),
        url,
        name: filename,
        type: fileType,
        category,
        isPublic: folderPermissions[category] ?? false,
        createdAt: timestamp,
        companyId,
      };
      const nextFiles = [...files, newFile];
      setFiles(nextFiles);
      onUpdate(toJobMedia(nextFiles), folderPermissions);
    } catch (e: any) {
      Alert.alert('Upload Failed', e.message);
    } finally {
      setUploading(null);
    }
  };

  const pickFromCamera = async (category: string) => {
    const permResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permResult.granted) {
      Alert.alert('Permission Required', 'Please allow camera access to take photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    await processAndUpload(category, asset.uri, asset.fileName ?? undefined, 'image');
  };

  const pickFromGallery = async (category: string) => {
    const permResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permResult.granted) {
      Alert.alert('Permission Required', 'Please allow photo access to upload files.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    await processAndUpload(category, asset.uri, asset.fileName ?? undefined, 'image');
  };

  const pickDocument = async (category: string) => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    await processAndUpload(category, asset.uri, asset.name ?? undefined, 'pdf');
  };

  const categoryFiles = (cat: string) => files.filter((f) => f.category === cat);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {CATEGORIES.map((cat) => {
        const catFiles = categoryFiles(cat);
        const isExpanded = expanded[cat];
        const isUploading = uploading === cat;
        const isPdfCategory = PDF_CATEGORIES.has(cat);

        return (
          <View key={cat} style={styles.folder}>

            {/* Folder header — Pressable kept for multi-content row (text + switch) */}
            <Pressable
              style={styles.folderHeader}
              onPress={() => toggleExpanded(cat)}
            >
              <View style={styles.folderHeaderLeft}>
                <Typography style={styles.folderArrow}>
                  {isExpanded ? '▼' : '▶'}
                </Typography>
                <Typography style={styles.folderName}>
                  {cat} ({catFiles.length})
                </Typography>
              </View>
              <View style={styles.folderHeaderRight}>
                <Typography style={styles.shareLabel}>Share</Typography>
                <Switch
                  value={folderPermissions[cat]}
                  onValueChange={(v) => toggleFolderPermission(cat, v)}
                  trackColor={{ false: COLORS.border, true: COLORS.primaryLight }}
                  thumbColor={folderPermissions[cat] ? COLORS.primary : COLORS.textDisabled}
                />
              </View>
            </Pressable>

            {/* Folder body */}
            {isExpanded && (
              <View style={styles.folderBody}>

                {/* Camera + Gallery buttons side-by-side */}
                <View style={styles.actionRow}>
                  <Button
                    variant="outline"
                    size="sm"
                    label="Camera 📷"
                    onPress={() => pickFromCamera(cat)}
                    disabled={isUploading}
                    isLoading={isUploading}
                    style={styles.addPhotoButton}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    label="Gallery 📂"
                    onPress={() => pickFromGallery(cat)}
                    disabled={isUploading}
                    isLoading={isUploading}
                    style={styles.addPhotoButton}
                  />
                </View>

                {/* PDF button on its own row (Documents folder only) */}
                {isPdfCategory && (
                  <Button
                    variant="outline"
                    size="sm"
                    label="+ Add PDF"
                    onPress={() => pickDocument(cat)}
                    disabled={isUploading}
                    isLoading={isUploading}
                    style={styles.addDocButton}
                  />
                )}

                {/* File grid */}
                {catFiles.length > 0 && (
                  <View style={styles.photoGrid}>
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
                          />
                        )}
                        <View style={styles.photoControls}>
                          <View style={styles.photoShareRow}>
                            <Typography style={styles.photoShareLabel}>Public</Typography>
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
                  </View>
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

  // Folder wrapper
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

  // Folder body
  folderBody: {
    padding: SPACING.md,
    gap: SPACING.md,
  },

  // Action buttons
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

  // PDF thumbnail
  pdfThumbnail: {
    width: 140,
    height: 100,
    backgroundColor: COLORS.secondaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.sm,
  },
  pdfIcon: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.heavy,
    color: COLORS.danger,
    marginBottom: SPACING.xs,
  },
  pdfName: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },

  // Photo grid
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  photoItem: {
    width: 140,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  thumbnail: {
    width: 140,
    height: 100,
    resizeMode: 'cover',
  },
  photoControls: {
    padding: SPACING.sm,
    gap: SPACING.xs,
  },
  photoShareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  photoShareLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
  },
  smallSwitch: {
    transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }],
  },
  deleteButton: {
    alignSelf: 'center',
  },
});
