/**
 * Image Upload Queue — AsyncStorage-backed queue for deferred Firebase Storage uploads.
 *
 * Items added here while offline (or after a failed live upload) are drained by
 * useImageSyncManager the next time the device comes back online.
 * This queue stores only metadata (URIs, jobId, photoType) — the actual image
 * bytes live in the Image Vault (utils/imageVault.ts) and are referenced by URI.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'roofing_imageUploadQueue';

export interface QueuedImage {
  id: string;
  jobId: string;
  uri: string;
  photoType: 'inspectionPhotos' | 'installPhotos';
  timestamp: number;
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

async function readQueue(): Promise<QueuedImage[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedImage[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedImage[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getQueue(): Promise<QueuedImage[]> {
  return readQueue();
}

export async function addToQueue(
  item: Omit<QueuedImage, 'id' | 'timestamp'>,
): Promise<void> {
  const queue = await readQueue();
  const newItem: QueuedImage = {
    ...item,
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
  };
  await writeQueue([...queue, newItem]);
}

export async function removeFromQueue(id: string): Promise<void> {
  const queue = await readQueue();
  await writeQueue(queue.filter((item) => item.id !== id));
}

export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}
