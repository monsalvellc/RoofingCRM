import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../../config/firebaseConfig';
import type { JobMedia } from '../../types/job';

// ─── Photo Upload ──────────────────────────────────────────────────────────────

/**
 * Uploads a single job photo to Firebase Storage and returns a typed JobMedia object.
 * Stored at: jobs/{jobId}/{photoType}/{mediaId}
 *
 * @param jobId        - The Firestore job document ID (used as the Storage folder).
 * @param photoType    - 'inspectionPhotos' or 'installPhotos'.
 * @param uri          - The local file URI returned by the image picker.
 * @param uniqueSuffix - Optional suffix appended to the media ID (use for batch uploads).
 */
export async function uploadJobPhoto(
  jobId: string,
  photoType: 'inspectionPhotos' | 'installPhotos',
  uri: string,
  uniqueSuffix?: string,
): Promise<JobMedia> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const mediaId = uniqueSuffix ? `${Date.now()}_${uniqueSuffix}` : Date.now().toString();
    const imageRef = ref(storage, `jobs/${jobId}/${photoType}/${mediaId}`);
    await uploadBytes(imageRef, blob);
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
    await uploadBytes(docRef, blob);
    return await getDownloadURL(docRef);
  } catch (error) {
    console.error('[storageService] uploadJobDocument failed:', error);
    throw new Error('Failed to upload document. Please try again.');
  }
}

// ─── Lead (Pre-Job) Upload ────────────────────────────────────────────────────

/**
 * Uploads a photo or document file for a lead before a job ID exists.
 * Stored at: leads/{companyId}/{category}/{timestamp}_{fileName}
 * Returns the Firebase Storage download URL.
 * @throws If the upload fails.
 */
export async function uploadLeadFile(
  companyId: string,
  category: string,
  uri: string,
  fileName: string,
): Promise<string> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const timestamp = Date.now();
    const fileRef = ref(storage, `leads/${companyId}/${category}/${timestamp}_${fileName}`);
    await uploadBytes(fileRef, blob);
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
