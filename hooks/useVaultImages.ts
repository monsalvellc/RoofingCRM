/**
 * useVaultImages — reads all locally-vaulted files (photos + documents) for a
 * job and exposes a `syncToCloud` function that uploads everything, cleans up
 * local files, and refreshes the React Query cache.
 *
 * vaultCount includes both images and documents so the sync banner reflects the
 * true number of pending items.
 */

import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getVaultImagesByJob,
  getVaultDocuments,
  deleteVaultImage,
  deleteVaultFile,
  type VaultImage,
  type VaultDocFile,
} from '../utils/imageVault';
import {
  uploadJobPhoto,
  appendJobMedia,
  uploadJobDocument,
  appendJobFile,
} from '../services';
import { jobKeys } from './useJobs';
import { invalidateOfflineMedia, invalidateOfflineDocs } from './useOfflineMedia';
import type { JobFile } from '../types';

export type { VaultImage };

export function useVaultImages(jobId: string) {
  const queryClient = useQueryClient();
  const [vaultImages, setVaultImages] = useState<VaultImage[]>([]);
  const [vaultDocs, setVaultDocs] = useState<VaultDocFile[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);

  const refresh = useCallback(() => {
    if (!jobId) return;
    getVaultImagesByJob(jobId).then(setVaultImages);
    getVaultDocuments(jobId).then(setVaultDocs);
  }, [jobId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /**
   * Uploads all vaulted images then all vaulted documents, one at a time.
   * On each success: writes to Firestore, deletes the local file, updates
   * progress, and invalidates the relevant React Query cache key so the gallery
   * updates per-item rather than waiting for the whole batch to finish.
   * Failures leave the file in the vault for the next attempt.
   */
  const syncToCloud = useCallback(async () => {
    const totalItems = vaultImages.length + vaultDocs.length;
    if (!jobId || totalItems === 0 || isSyncing) return;

    setIsSyncing(true);
    setSyncProgress(0);

    let completed = 0;
    const totalForProgress = totalItems;

    // ── Phase 1: Photos ──────────────────────────────────────────────────────
    const remainingImages: VaultImage[] = [];

    for (let i = 0; i < vaultImages.length; i++) {
      const { uri, photoType } = vaultImages[i];
      try {
        const uniqueId = String(Date.now() + i);
        const media = await uploadJobPhoto(jobId, photoType, uri, uniqueId);
        await appendJobMedia(jobId, photoType, media);
        await deleteVaultImage(uri);
        invalidateOfflineMedia(queryClient, jobId);
        completed++;
        setSyncProgress(Math.round((completed / totalForProgress) * 100));
      } catch (error) {
        console.warn('[useVaultImages] Failed to sync vault image:', uri, error);
        remainingImages.push({ uri, photoType });
      }
    }

    // ── Phase 2: Documents ───────────────────────────────────────────────────
    const remainingDocs: VaultDocFile[] = [];

    for (let i = 0; i < vaultDocs.length; i++) {
      const { uri, name } = vaultDocs[i];
      try {
        const url = await uploadJobDocument(jobId, uri, name);
        const newFile: JobFile = {
          id: String(Date.now() + i),
          url,
          name,
          type: 'document',
          isSharedWithCustomer: false,
          createdAt: new Date().toISOString(),
        };
        await appendJobFile(jobId, newFile);
        await deleteVaultFile(uri);
        invalidateOfflineDocs(queryClient, jobId);
        completed++;
        setSyncProgress(Math.round((completed / totalForProgress) * 100));
      } catch (error) {
        console.warn('[useVaultImages] Failed to sync vault doc:', uri, error);
        remainingDocs.push({ uri, name });
      }
    }

    setVaultImages(remainingImages);
    setVaultDocs(remainingDocs);
    setIsSyncing(false);
    setSyncProgress(0);

    if (completed > 0) {
      queryClient.invalidateQueries({ queryKey: jobKeys.detail(jobId) });
      queryClient.invalidateQueries({ queryKey: jobKeys.all });
    }
  }, [jobId, vaultImages, vaultDocs, isSyncing, queryClient]);

  return {
    vaultImages,
    vaultDocs,
    // Combined count drives the sync banner visibility.
    vaultCount: vaultImages.length + vaultDocs.length,
    isSyncing,
    syncProgress,
    syncToCloud,
    refresh,
  };
}
