/**
 * Image & Document Vault — Persistent local file storage via expo-file-system.
 *
 * Directory layout:
 *   <documentDirectory>/Vault/Images/<jobId>/inspectionPhotos/<ts>.jpg
 *   <documentDirectory>/Vault/Images/<jobId>/installPhotos/<ts>.jpg
 *   <documentDirectory>/Vault/Images/<jobId>/documents/<ts>_<filename>
 *
 * IMPORTANT: must import from 'expo-file-system/legacy'.
 * The bare 'expo-file-system' export in v18+ uses a new class-based API that
 * does NOT expose documentDirectory, copyAsync, makeDirectoryAsync, etc.
 */

import * as FileSystem from 'expo-file-system/legacy';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type VaultPhotoType = 'inspectionPhotos' | 'installPhotos';

/** A vaulted photo (image). */
export interface VaultImage {
  uri: string;
  photoType: VaultPhotoType;
}

/** A vaulted document (PDF, etc.). */
export interface VaultDocFile {
  uri: string;
  /** Original filename — needed for display and upload. */
  name: string;
}

// ─── Root Paths ───────────────────────────────────────────────────────────────

const IMAGE_VAULT_ROOT = `${FileSystem.documentDirectory}Vault/Images/`;

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function jobImageDir(jobId: string, photoType: VaultPhotoType): string {
  return `${IMAGE_VAULT_ROOT}${jobId}/${photoType}/`;
}

function jobDocDir(jobId: string): string {
  return `${IMAGE_VAULT_ROOT}${jobId}/documents/`;
}

function jobRootDir(jobId: string): string {
  return `${IMAGE_VAULT_ROOT}${jobId}/`;
}

/**
 * Unconditionally creates the directory tree.
 * makeDirectoryAsync with intermediates:true is idempotent — no-throw if the
 * dir already exists. Avoids the extra getInfoAsync round-trip + TOCTOU risk.
 */
async function ensureDir(dir: string): Promise<void> {
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
}

/**
 * Guarantees the URI has the file:// scheme that React Native's <Image>
 * and expo-image require for local paths. Most devices include it already,
 * but some simulator configurations strip it.
 */
function normalizeUri(uri: string): string {
  if (uri.startsWith('file://') || uri.startsWith('http')) return uri;
  return `file://${uri}`;
}

// ─── Photo API ────────────────────────────────────────────────────────────────

/**
 * Copies a photo from its ephemeral picker URI into the persistent vault.
 * Returns the permanent local URI. On failure returns the original URI as
 * a fallback so the caller can still attempt to display it.
 */
export async function saveImageToVault(
  jobId: string,
  photoType: VaultPhotoType,
  uri: string,
): Promise<string> {
  try {
    const dir = jobImageDir(jobId, photoType);
    await ensureDir(dir);

    const sourceUri = normalizeUri(uri);
    const destUri = normalizeUri(`${dir}${Date.now()}.jpg`);

    console.log('💾 Vault Save Attempt:', { jobId, photoType, sourceUri, destUri });

    await FileSystem.copyAsync({ from: sourceUri, to: destUri });

    const check = await FileSystem.getInfoAsync(destUri);
    if (!check.exists) {
      throw new Error(`copyAsync completed but file not found at ${destUri}`);
    }

    console.log('✅ Vault Save Success:', destUri);
    return destUri;
  } catch (error) {
    console.warn(`[imageVault] saveImageToVault(${jobId}/${photoType}) failed:`, error);
    return uri;
  }
}

/** Returns vault images for a job+type, sorted oldest-first. */
export async function getVaultImages(
  jobId: string,
  photoType: VaultPhotoType,
): Promise<string[]> {
  try {
    const dir = jobImageDir(jobId, photoType);
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) return [];

    const files = await FileSystem.readDirectoryAsync(dir);
    return files
      .filter((f) => /\.(jpg|jpeg|png)$/i.test(f))
      .sort()
      .map((f) => normalizeUri(`${dir}${f}`));
  } catch (error) {
    console.warn(`[imageVault] getVaultImages(${jobId}/${photoType}) failed:`, error);
    return [];
  }
}

/** Returns all vault images for a job across both photo types. */
export async function getVaultImagesByJob(jobId: string): Promise<VaultImage[]> {
  const types: VaultPhotoType[] = ['inspectionPhotos', 'installPhotos'];
  const results = await Promise.all(
    types.map(async (photoType) => {
      const uris = await getVaultImages(jobId, photoType);
      return uris.map((uri) => ({ uri, photoType }));
    }),
  );
  return results.flat();
}

// ─── Document API ─────────────────────────────────────────────────────────────

/**
 * Copies a document from its ephemeral picker URI into the persistent vault.
 * The original filename is embedded into the destination name so it can be
 * recovered later for display and upload.
 *
 * Returns the permanent local URI. On failure returns the original URI.
 */
export async function saveDocumentToVault(
  jobId: string,
  uri: string,
  fileName: string,
): Promise<string> {
  try {
    const dir = jobDocDir(jobId);
    await ensureDir(dir);

    // Sanitise filename and prefix with timestamp to avoid collisions.
    const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const destUri = normalizeUri(`${dir}${Date.now()}_${safe}`);
    const sourceUri = normalizeUri(uri);

    console.log('💾 Vault Doc Save Attempt:', { jobId, fileName, destUri });

    await FileSystem.copyAsync({ from: sourceUri, to: destUri });

    const check = await FileSystem.getInfoAsync(destUri);
    if (!check.exists) {
      throw new Error(`Doc copy completed but file not found at ${destUri}`);
    }

    console.log('✅ Vault Doc Save Success:', destUri);
    return destUri;
  } catch (error) {
    console.warn(`[imageVault] saveDocumentToVault(${jobId}) failed:`, error);
    return uri;
  }
}

/**
 * Returns all vault documents for a job, sorted oldest-first.
 * The original filename is recovered by stripping the leading timestamp prefix.
 */
export async function getVaultDocuments(jobId: string): Promise<VaultDocFile[]> {
  try {
    const dir = jobDocDir(jobId);
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) return [];

    const files = await FileSystem.readDirectoryAsync(dir);
    return files
      .sort()
      .map((f) => ({
        uri: normalizeUri(`${dir}${f}`),
        // Strip the leading "<timestamp>_" prefix to recover the display name.
        name: f.replace(/^\d+_/, ''),
      }));
  } catch (error) {
    console.warn(`[imageVault] getVaultDocuments(${jobId}) failed:`, error);
    return [];
  }
}

// ─── Shared Delete / Cleanup ──────────────────────────────────────────────────

/**
 * Deletes any single vault file (image or document) by its URI.
 * Idempotent — safe to call even if the file was already removed.
 */
export async function deleteVaultImage(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(normalizeUri(uri), { idempotent: true });
  } catch (error) {
    console.warn('[imageVault] deleteVaultImage failed:', error);
  }
}

// Alias so callers that hold documents can use a semantically correct name.
export const deleteVaultFile = deleteVaultImage;

/**
 * Returns all job IDs that currently have at least one vaulted file
 * (image or document). Used by the pipeline to determine SyncBadge visibility.
 */
export async function getAllVaultJobIds(): Promise<string[]> {
  try {
    const rootInfo = await FileSystem.getInfoAsync(IMAGE_VAULT_ROOT);
    if (!rootInfo.exists) return [];

    const jobFolders = await FileSystem.readDirectoryAsync(IMAGE_VAULT_ROOT);
    const results = await Promise.all(
      jobFolders.map(async (folder) => {
        const images = await getVaultImagesByJob(folder);
        const docs = await getVaultDocuments(folder);
        return images.length > 0 || docs.length > 0 ? folder : null;
      }),
    );
    return results.filter((id): id is string => id !== null);
  } catch (error) {
    console.warn('[imageVault] getAllVaultJobIds failed:', error);
    return [];
  }
}

/**
 * Deletes the entire vault directory for a job (images + documents).
 * Only call after all files have been successfully uploaded.
 */
export async function clearJobImageVault(jobId: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(jobRootDir(jobId), { idempotent: true });
  } catch (error) {
    console.warn(`[imageVault] clearJobImageVault(${jobId}) failed:`, error);
  }
}
