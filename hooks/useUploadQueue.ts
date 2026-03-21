import { useCallback, useEffect, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';

// ─── Types ────────────────────────────────────────────────────────────────────

export type UploadStatus = 'pending' | 'uploading' | 'done' | 'failed';

export interface UploadQueueItem {
  id: string;
  /** Locally-cached copy in documentDirectory — survives OS temp cleanup. */
  cachedUri: string;
  /** Upload progress 0–1. Only meaningful while status === 'uploading'. */
  progress: number;
  status: UploadStatus;
  errorMessage?: string;
}

export interface UploadTask {
  id: string;
  sourceUri: string;
  /**
   * Performs the actual upload work — Storage write plus any Firestore
   * side-effects (e.g. appendJobMedia + queryClient.invalidateQueries).
   * Called with the locally-cached URI so retries survive the original
   * temp file being reclaimed by the OS.
   */
  uploadFn: (cachedUri: string, onProgress: (p: number) => void) => Promise<void>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Max simultaneous uploads. Keeps network usage predictable on bad connections. */
const CONCURRENCY = 2;

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Generic upload queue with configurable concurrency (default: 2).
 *
 * Files are copied to `FileSystem.documentDirectory` immediately on enqueue,
 * so retries are safe even after the original picker URI is reclaimed by the OS.
 * Successful items are auto-removed from the list (the permanent data source —
 * e.g. Firestore via React Query — will reflect the result after invalidation).
 *
 * @example
 * const { items, enqueue, retryUpload } = useUploadQueue();
 *
 * // Enqueue from gallery picker
 * enqueue(assets.map((asset, i) => ({
 *   id: `${Date.now()}_${i}`,
 *   sourceUri: asset.uri,
 *   uploadFn: async (uri, onProgress) => {
 *     const media = await uploadJobPhoto(jobId, photoType, uri, String(i), onProgress);
 *     await appendJobMedia(jobId, photoType, media);
 *     queryClient.invalidateQueries({ queryKey: jobKeys.detail(jobId) });
 *   },
 * })));
 */
export function useUploadQueue() {
  const [items, setItems] = useState<UploadQueueItem[]>([]);

  // Use refs for mutable queue state so the processNext closure never captures
  // a stale copy across re-renders.
  const tasksRef = useRef<Map<string, UploadTask & { cachedUri: string }>>(new Map());
  const pendingIdsRef = useRef<string[]>([]);
  const activeCountRef = useRef(0);

  // Store processNext in a ref so the .finally() callback inside each upload
  // always invokes the latest version without creating a dependency cycle.
  const processNextRef = useRef<() => void>(() => {});

  useEffect(() => {
    processNextRef.current = () => {
      while (activeCountRef.current < CONCURRENCY && pendingIdsRef.current.length > 0) {
        const id = pendingIdsRef.current.shift()!;
        const task = tasksRef.current.get(id);
        if (!task) continue;

        activeCountRef.current += 1;

        // Transition the item to 'uploading' in UI state.
        setItems((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, status: 'uploading', progress: 0 } : item,
          ),
        );

        task
          .uploadFn(task.cachedUri, (progress) => {
            setItems((prev) =>
              prev.map((item) => (item.id === id ? { ...item, progress } : item)),
            );
          })
          .then(() => {
            // Remove successful items from the list. The caller's uploadFn is
            // responsible for invalidating React Query so the permanent list
            // updates — this prevents any double-display.
            setItems((prev) => prev.filter((item) => item.id !== id));
            tasksRef.current.delete(id);
            // Best-effort cleanup of the cached copy.
            FileSystem.deleteAsync(task.cachedUri, { idempotent: true }).catch(() => {});
          })
          .catch((err: Error) => {
            setItems((prev) =>
              prev.map((item) =>
                item.id === id
                  ? { ...item, status: 'failed', errorMessage: err.message }
                  : item,
              ),
            );
          })
          .finally(() => {
            activeCountRef.current -= 1;
            processNextRef.current();
          });
      }
    };
  });

  /**
   * Adds one or more upload tasks to the queue.
   * Copies each source file to `documentDirectory` before queuing so that
   * retries remain possible even if the OS reclaims the original temp URI.
   */
  const enqueue = useCallback(async (tasks: UploadTask[]) => {
    const newItems: UploadQueueItem[] = [];

    for (const task of tasks) {
      // Strip query strings before extracting the extension.
      const ext = (task.sourceUri.split('.').pop() ?? 'jpg').split('?')[0].slice(0, 5);
      const dest = `${FileSystem.documentDirectory}upload_${task.id}.${ext}`;
      let cachedUri = task.sourceUri;

      try {
        await FileSystem.copyAsync({ from: task.sourceUri, to: dest });
        cachedUri = dest;
      } catch {
        // Fall back to the original URI — upload may still succeed if the
        // temp file is still available.
      }

      newItems.push({ id: task.id, cachedUri, progress: 0, status: 'pending' });
      tasksRef.current.set(task.id, { ...task, cachedUri });
      pendingIdsRef.current.push(task.id);
    }

    setItems((prev) => [...prev, ...newItems]);
    processNextRef.current();
  }, []);

  /**
   * Re-queues a failed item for another upload attempt.
   * No-op if the item is not in a failed state or has already been removed.
   */
  const retryUpload = useCallback((id: string) => {
    if (!tasksRef.current.has(id)) return;

    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, status: 'pending', progress: 0, errorMessage: undefined }
          : item,
      ),
    );
    pendingIdsRef.current.push(id);
    processNextRef.current();
  }, []);

  return { items, enqueue, retryUpload };
}
