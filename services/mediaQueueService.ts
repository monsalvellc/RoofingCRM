/**
 * mediaQueueService — async, offline-capable photo upload queue.
 *
 * Flow:
 *   1. User picks a photo  →  addToMediaQueue() copies it to a permanent vault
 *      directory and returns an optimistic JobMedia (url = local file:// path).
 *   2. Caller injects the optimistic item into the React Query cache so the
 *      gallery renders immediately with a "Syncing…" badge.
 *   3. processMediaQueue() (called by the Sync button / SyncContext) groups items
 *      by jobId, uploads each job's files concurrently (max UPLOAD_CONCURRENCY),
 *      then performs a single batched Firestore write per job before moving on.
 *   4. Caller's onJobUpdated() invalidates the React Query cache so the gallery
 *      swaps the optimistic item for the confirmed Firestore item.
 *
 * The queue is persisted in AsyncStorage so pending uploads survive app restarts.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { storage, db } from '../config/firebaseConfig';
import { COLLECTIONS } from '../constants/config';
import type { JobMedia } from '../types/job';

// ─── Constants ────────────────────────────────────────────────────────────────

const QUEUE_KEY = '@media_upload_queue_v1';
/** Permanent local directory — survives app restarts, unlike the picker's temp URI. */
const QUEUE_VAULT = `${FileSystem.documentDirectory}MediaUploadQueue/`;
/** Max simultaneous Firebase Storage uploads per processMediaQueue() call. */
const UPLOAD_CONCURRENCY = 3;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MediaQueueItem {
  id: string;
  jobId: string;
  photoType: 'inspectionPhotos' | 'installPhotos';
  /** Permanent file:// path inside QUEUE_VAULT. */
  localUri: string;
  comment: string;
  category: 'inspection' | 'install';
  createdAt: number;
  retryCount: number;
}

interface UploadSuccess {
  item: MediaQueueItem;
  downloadUrl: string;
}

// ─── Queue persistence ────────────────────────────────────────────────────────

async function readQueue(): Promise<MediaQueueItem[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as MediaQueueItem[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(items: MediaQueueItem[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Runs an array of async task factories with a maximum concurrency limit.
 * Returns results in the same order as the input, matching Promise.allSettled semantics.
 */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < tasks.length) {
      const i = nextIndex++;
      try {
        results[i] = { status: 'fulfilled', value: await tasks[i]() };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

/**
 * Uploads a single queue item to Firebase Storage and returns its download URL.
 * Uses the XHR blob method — bulletproof with file:// URIs on Hermes/React Native.
 */
async function uploadItem(item: MediaQueueItem): Promise<UploadSuccess> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => resolve(xhr.response);
    xhr.onerror = () => reject(new TypeError('Network request failed'));
    xhr.responseType = 'blob';
    xhr.open('GET', item.localUri, true);
    xhr.send(null);
  });

  const storageRef = ref(
    storage,
    `jobs/${item.jobId}/${item.photoType}/${item.id}.jpg`,
  );
  await new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, blob);
    task.on('state_changed', undefined, reject, resolve);
  });

  const downloadUrl = await getDownloadURL(storageRef);
  return { item, downloadUrl };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Stages a photo for background upload.
 *
 * Copies the ephemeral picker URI to a permanent local path, persists the item
 * in AsyncStorage, and immediately returns an optimistic JobMedia whose `url`
 * is the local file:// path. The caller should inject this into the React Query
 * job cache so the gallery renders without waiting for the upload.
 */
export async function addToMediaQueue(
  jobId: string,
  photoType: 'inspectionPhotos' | 'installPhotos',
  uri: string,
  comment: string,
): Promise<JobMedia> {
  await FileSystem.makeDirectoryAsync(QUEUE_VAULT, { intermediates: true });

  const id = `mq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const localUri = `${QUEUE_VAULT}${id}.jpg`;

  // Copy from the ephemeral picker URI to permanent storage before returning.
  await FileSystem.copyAsync({ from: uri, to: localUri });

  const category: 'inspection' | 'install' =
    photoType === 'inspectionPhotos' ? 'inspection' : 'install';

  const item: MediaQueueItem = {
    id,
    jobId,
    photoType,
    localUri,
    comment,
    category,
    createdAt: Date.now(),
    retryCount: 0,
  };

  const queue = await readQueue();
  await writeQueue([...queue, item]);

  // Return the optimistic object — url points to the local file.
  // The gallery uses `url.startsWith('file://')` to detect pending items.
  return {
    id,
    url: localUri,
    category,
    shared: false,
    uploadedAt: new Date().toISOString(),
    comment,
  };
}

/**
 * Processes all items in the upload queue with batched concurrency.
 *
 * Strategy per job:
 *   1. Group queue items by jobId.
 *   2. Upload all items for a job concurrently (max UPLOAD_CONCURRENCY at once)
 *      using the XHR blob method — bulletproof with file:// URIs on Hermes.
 *   3. After Storage uploads settle, perform a SINGLE Firestore updateDoc per job
 *      that patches both inspectionPhotos and installPhotos arrays in one write,
 *      replacing optimistic local-URI entries with confirmed download URLs and
 *      preserving each item's comment.
 *   4. Delete local vault files for succeeded uploads (best-effort).
 *   5. Remove succeeded items from the queue; increment retryCount on failures.
 *   6. Call onJobUpdated(jobId) so the caller can invalidate React Query caches.
 */
export async function processMediaQueue(
  onJobUpdated?: (jobId: string) => void,
): Promise<void> {
  const queue = await readQueue();
  if (queue.length === 0) return;

  // 1. Group by jobId.
  const byJob = new Map<string, MediaQueueItem[]>();
  for (const item of queue) {
    const group = byJob.get(item.jobId) ?? [];
    group.push(item);
    byJob.set(item.jobId, group);
  }

  for (const [jobId, items] of byJob) {
    // 2. Concurrent Storage uploads — max UPLOAD_CONCURRENCY at a time.
    const tasks = items.map((item) => () => uploadItem(item));
    const settled = await runWithConcurrency<UploadSuccess>(tasks, UPLOAD_CONCURRENCY);

    const successes: UploadSuccess[] = [];
    const failedItems: MediaQueueItem[] = [];

    settled.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        successes.push(result.value);
      } else {
        console.warn(`[mediaQueueService] Upload failed for ${items[i].id}:`, result.reason);
        failedItems.push(items[i]);
      }
    });

    // 3. Single batched Firestore write for all succeeded uploads on this job.
    if (successes.length > 0) {
      try {
        const jobSnap = await getDoc(doc(db, COLLECTIONS.jobs, jobId));
        if (jobSnap.exists()) {
          const jobData = jobSnap.data();
          const updatePayload: Record<string, JobMedia[]> = {};

          for (const photoType of ['inspectionPhotos', 'installPhotos'] as const) {
            const typeSuccesses = successes.filter((s) => s.item.photoType === photoType);
            if (typeSuccesses.length === 0) continue;

            let photos = (jobData?.[photoType] ?? []) as JobMedia[];

            for (const { item, downloadUrl } of typeSuccesses) {
              const idx = photos.findIndex((p) => p.id === item.id);
              if (idx !== -1) {
                // Replace optimistic local-URI entry — preserve comment.
                photos = photos.map((p) =>
                  p.id === item.id ? { ...p, url: downloadUrl, comment: item.comment } : p,
                );
              } else {
                // Optimistic write never reached Firestore — append confirmed entry.
                photos = [
                  ...photos,
                  {
                    id: item.id,
                    url: downloadUrl,
                    category: item.category,
                    shared: false,
                    uploadedAt: new Date().toISOString(),
                    comment: item.comment,
                  },
                ];
              }
            }

            updatePayload[photoType] = photos;
          }

          if (Object.keys(updatePayload).length > 0) {
            await updateDoc(doc(db, COLLECTIONS.jobs, jobId), updatePayload);
          }
        }
      } catch (firestoreErr) {
        // Firestore write failed — treat all "successes" as failures so they
        // stay in the queue and the Firestore doc is retried next sync pass.
        console.warn(`[mediaQueueService] Firestore write failed for job ${jobId}:`, firestoreErr);
        failedItems.push(...successes.map((s) => s.item));
        successes.length = 0;
      }
    }

    // 4. Clean up local vault files for confirmed uploads (best-effort).
    await Promise.allSettled(
      successes.map(({ item }) =>
        FileSystem.deleteAsync(item.localUri, { idempotent: true }),
      ),
    );

    // 5. Persist queue update atomically — read fresh to avoid race conditions.
    const successIds = new Set(successes.map((s) => s.item.id));
    const failedIds = new Set(failedItems.map((f) => f.id));

    const currentQueue = await readQueue();
    await writeQueue(
      currentQueue
        .filter((q) => !successIds.has(q.id))
        .map((q) => (failedIds.has(q.id) ? { ...q, retryCount: q.retryCount + 1 } : q)),
    );

    // 6. Notify caller to invalidate React Query caches for this job.
    if (successes.length > 0) {
      onJobUpdated?.(jobId);
    }
  }
}

/**
 * Returns the total number of items currently waiting in the queue.
 * Useful for badge counts or sync status indicators.
 */
export async function getPendingQueueCount(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}

/**
 * Removes all queued items for a specific job without uploading them.
 * Call when a job is deleted locally to avoid orphaned uploads.
 */
export async function clearQueueForJob(jobId: string): Promise<void> {
  const queue = await readQueue();
  const toRemove = queue.filter((item) => item.jobId === jobId);
  // Best-effort local file cleanup.
  await Promise.allSettled(
    toRemove.map((item) =>
      FileSystem.deleteAsync(item.localUri, { idempotent: true }),
    ),
  );
  await writeQueue(queue.filter((item) => item.jobId !== jobId));
}
