import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { storage } from '../../config/firebaseConfig';
import type { JobMedia } from '../../types/job';

// ─── Photo Upload ──────────────────────────────────────────────────────────────

/**
 * Uploads a single job photo to Firebase Storage and returns a typed JobMedia object.
 * Uses uploadBytesResumable so progress can be tracked, allowing the caller to show
 * a per-item progress indicator in the UI.
 * Stored at: jobs/{jobId}/{photoType}/{mediaId}
 *
 * @param jobId        - The Firestore job document ID (used as the Storage folder).
 * @param photoType    - 'inspectionPhotos' or 'installPhotos'.
 * @param uri          - The local file URI returned by the image picker.
 * @param uniqueSuffix - Optional suffix appended to the media ID (use for batch uploads).
 * @param onProgress   - Optional callback invoked with upload progress 0–1.
 */
export async function uploadJobPhoto(
  jobId: string,
  photoType: 'inspectionPhotos' | 'installPhotos',
  uri: string,
  uniqueSuffix?: string,
  onProgress?: (progress: number) => void,
): Promise<JobMedia> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const mediaId = uniqueSuffix ? `${Date.now()}_${uniqueSuffix}` : Date.now().toString();
    const imageRef = ref(storage, `jobs/${jobId}/${photoType}/${mediaId}`);

    await new Promise<void>((resolve, reject) => {
      const task = uploadBytesResumable(imageRef, blob);
      task.on(
        'state_changed',
        (snapshot) => {
          onProgress?.(snapshot.bytesTransferred / snapshot.totalBytes);
        },
        reject,
        resolve,
      );
    });

    const url = await getDownloadURL(imageRef);
    return {
      id: mediaId,
      url,
      category: photoType === 'inspectionPhotos' ? 'inspection' : 'install',
      shared: false,
      uploadedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[storageService] uploadJobPhoto failed:', error);
    throw new Error('Failed to upload photo. Please try again.');
  }
}

// ─── Document Upload ───────────────────────────────────────────────────────────

/**
 * Uploads a document file to Firebase Storage and returns its download URL.
 * Uses uploadBytesResumable internally for consistent behaviour with photo uploads.
 * Stored at: jobs/{jobId}/{timestamp}_{fileName}
 *
 * @param jobId    - The Firestore job document ID.
 * @param uri      - The local file URI returned by the document picker.
 * @param fileName - The original file name (appended to the Storage path).
 */
export async function uploadJobDocument(
  jobId: string,
  uri: string,
  fileName: string,
): Promise<string> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const docRef = ref(storage, `jobs/${jobId}/${Date.now()}_${fileName}`);

    await new Promise<void>((resolve, reject) => {
      const task = uploadBytesResumable(docRef, blob);
      task.on('state_changed', undefined, reject, resolve);
    });

    return await getDownloadURL(docRef);
  } catch (error) {
    console.error('[storageService] uploadJobDocument failed:', error);
    throw new Error('Failed to upload document. Please try again.');
  }
}

// ─── Lead (Pre-Job) Upload ────────────────────────────────────────────────────

/**
 * Uploads a photo or document file for a lead before a job ID exists.
 * Uses uploadBytesResumable so callers can track progress per item.
 * Stored at: leads/{companyId}/{category}/{timestamp}_{fileName}
 *
 * @param companyId  - The company's Firestore document ID.
 * @param category   - Folder category name (e.g. 'Inspection', 'Documents').
 * @param uri        - The local file URI.
 * @param fileName   - The original file name.
 * @param onProgress - Optional callback invoked with upload progress 0–1.
 * @throws If the upload fails.
 */
export async function uploadLeadFile(
  companyId: string,
  category: string,
  uri: string,
  fileName: string,
  onProgress?: (progress: number) => void,
): Promise<string> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const timestamp = Date.now();
    const fileRef = ref(storage, `leads/${companyId}/${category}/${timestamp}_${fileName}`);

    await new Promise<void>((resolve, reject) => {
      const task = uploadBytesResumable(fileRef, blob);
      task.on(
        'state_changed',
        (snapshot) => {
          onProgress?.(snapshot.bytesTransferred / snapshot.totalBytes);
        },
        reject,
        resolve,
      );
    });

    return await getDownloadURL(fileRef);
  } catch (error) {
    console.error('[storageService] uploadLeadFile failed:', error);
    throw new Error('Failed to upload file. Please try again.');
  }
}

// ─── Delete ────────────────────────────────────────────────────────────────────

/**
 * Attempts to delete a file from Firebase Storage by its download URL.
 * This is best-effort: failures are logged but NOT re-thrown, since Firestore
 * cleanup has already completed before this is called.
 *
 * @param url - The Firebase Storage download URL of the file to delete.
 */
export async function deleteStorageFile(url: string): Promise<void> {
  try {
    await deleteObject(ref(storage, url));
  } catch (error) {
    console.warn('[storageService] deleteStorageFile — best-effort delete failed:', error);
  }
}
