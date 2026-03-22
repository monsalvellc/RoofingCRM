/**
 * Media Vault — persistent local storage for offline media.
 *
 * Every file is copied from its ephemeral picker/camera URI into a permanent
 * directory keyed by jobId. This directory survives app restarts and is the
 * single source of truth for the sync button in job/[id].tsx.
 *
 * Directory layout:
 *   <documentDirectory>/OfflineMedia/<jobId>/inspectionPhotos/<ts>.jpg
 *   <documentDirectory>/OfflineMedia/<jobId>/installPhotos/<ts>.jpg
 *   <documentDirectory>/OfflineMedia/<jobId>/documents/<ts>_<safeName>
 *
 * IMPORTANT: must import from 'expo-file-system/legacy'.
 * The bare 'expo-file-system' export in v18+ uses a new class-based API that
 * does NOT expose documentDirectory, copyAsync, makeDirectoryAsync, etc.
 */

import * as FileSystem from 'expo-file-system/legacy';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type MediaPhotoType = 'inspectionPhotos' | 'installPhotos';
export type MediaType = MediaPhotoType | 'documents';

export interface VaultDocFile {
  uri: string;
  /** Original filename, recovered by stripping the timestamp prefix. */
  name: string;
}

// ─── Root Path ────────────────────────────────────────────────────────────────

export const MEDIA_VAULT_ROOT = `${FileSystem.documentDirectory}OfflineMedia/`;

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function mediaDir(jobId: string, type: MediaType): string {
  return `${MEDIA_VAULT_ROOT}${jobId}/${type}/`;
}

/**
 * Guarantees the file:// prefix that React Native's <Image> and expo-image
 * require for local file paths. Most real devices include it, but some
 * simulator configurations strip it, causing silent render failures.
 */
function normalizeUri(uri: string): string {
  if (uri.startsWith('file://') || uri.startsWith('http')) return uri;
  return `file://${uri}`;
}

async function ensureDir(dir: string): Promise<void> {
  // makeDirectoryAsync with intermediates:true is idempotent — no-throw if the
  // directory already exists, and creates the full path in one call.
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Copies a file from its ephemeral source URI into the permanent vault.
 *
 * @param jobId     The job this media belongs to.
 * @param type      'inspectionPhotos' | 'installPhotos' | 'documents'
 * @param localUri  The ephemeral URI from the camera, gallery, or document picker.
 * @param fileName  Required for 'documents' — the original display name.
 * @returns         The permanent `file://` URI safe to pass to <Image source={{ uri }}>.
 */
export async function saveMediaToVault(
  jobId: string,
  type: MediaType,
  localUri: string,
  fileName?: string,
): Promise<string> {
  const dir = mediaDir(jobId, type);
  await ensureDir(dir);

  const sourceUri = normalizeUri(localUri);
  const ts = Date.now();

  const safeName = fileName ? fileName.replace(/[^a-zA-Z0-9._-]/g, '_') : null;
  const destName =
    type === 'documents' && safeName
      ? `${ts}_${safeName}`
      : safeName
        ? `${ts}_${safeName}.jpg`
        : `${ts}.jpg`;

  const destUri = normalizeUri(`${dir}${destName}`);

  await FileSystem.copyAsync({ from: sourceUri, to: destUri });

  // Verify the copy actually landed — copyAsync can silently fail on some
  // Android versions if the source is a content:// URI that has been revoked.
  const check = await FileSystem.getInfoAsync(destUri);
  if (!check.exists) {
    throw new Error(`[mediaVault] copyAsync completed but file missing at ${destUri}`);
  }

  return destUri;
}

/**
 * Returns all pending media for a job, sorted oldest-first and categorised
 * by type. All URIs are guaranteed to have the `file://` prefix.
 */
export async function getMediaForJob(jobId: string): Promise<{
  pendingInspection: string[];
  pendingInstall: string[];
  pendingDocuments: VaultDocFile[];
}> {
  async function readPhotoDir(type: MediaPhotoType): Promise<string[]> {
    const dir = mediaDir(jobId, type);
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) return [];
    const files = await FileSystem.readDirectoryAsync(dir);
    return files
      .filter((f) => /\.(jpg|jpeg|png)$/i.test(f))
      .sort()
      .map((f) => normalizeUri(`${dir}${f}`));
  }

  async function readDocDir(): Promise<VaultDocFile[]> {
    const dir = mediaDir(jobId, 'documents');
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) return [];
    const files = await FileSystem.readDirectoryAsync(dir);
    return files.sort().map((f) => ({
      uri: normalizeUri(`${dir}${f}`),
      // Strip the leading "<timestamp>_" prefix to recover the display name.
      name: f.replace(/^\d+_/, ''),
    }));
  }

  const [pendingInspection, pendingInstall, pendingDocuments] = await Promise.all([
    readPhotoDir('inspectionPhotos').catch(() => []),
    readPhotoDir('installPhotos').catch(() => []),
    readDocDir().catch(() => []),
  ]);

  return { pendingInspection, pendingInstall, pendingDocuments };
}

/**
 * Deletes a single vault file after a successful cloud upload.
 * Idempotent — safe to call even if the file was already removed.
 */
export async function deleteMediaFromVault(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(normalizeUri(uri), { idempotent: true });
  } catch (error) {
    console.warn('[mediaVault] deleteMediaFromVault failed:', error);
  }
}

/**
 * Returns all jobIds in the vault that have at least one pending file.
 * Used by useVaultJobIds to drive SyncBadge visibility on pipeline cards.
 */
export async function getVaultJobIds(): Promise<string[]> {
  try {
    const info = await FileSystem.getInfoAsync(MEDIA_VAULT_ROOT);
    if (!info.exists) return [];
    const folders = await FileSystem.readDirectoryAsync(MEDIA_VAULT_ROOT);
    const results = await Promise.all(
      folders.map(async (folder) => {
        const { pendingInspection, pendingInstall, pendingDocuments } =
          await getMediaForJob(folder);
        const total =
          pendingInspection.length + pendingInstall.length + pendingDocuments.length;
        return total > 0 ? folder : null;
      }),
    );
    return results.filter((id): id is string => id !== null);
  } catch {
    return [];
  }
}
