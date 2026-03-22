/**
 * useOfflineMedia — reads the Media Vault for a job and exposes a
 * `refreshMedia()` function so the UI updates immediately after a vault write.
 *
 * Sync logic (upload + delete + ledger) has been moved to SyncContext so that
 * badge state is globally shared without per-screen FS scans.
 */

import { useCallback, useEffect, useState } from 'react';
import { getMediaForJob, type VaultDocFile } from '../utils/mediaVault';

export type { VaultDocFile };

// ─── Backward-compat stubs ────────────────────────────────────────────────────
// LeadImagePicker imports these names. Keeping them as no-ops prevents a
// compile error without requiring changes to that unrelated file.
export function invalidateOfflineMedia(): void {}
export function invalidateOfflineDocs(): void {}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOfflineMedia(jobId: string) {
  const [pendingInspectionPhotos, setPendingInspection] = useState<string[]>([]);
  const [pendingInstallPhotos, setPendingInstall] = useState<string[]>([]);
  const [pendingDocuments, setPendingDocuments] = useState<VaultDocFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Re-reads the vault and updates state. Call immediately after any
   * saveMediaToVault() so the image appears on screen right away.
   */
  const refreshMedia = useCallback(async () => {
    if (!jobId) return;
    setIsLoading(true);
    try {
      const { pendingInspection, pendingInstall, pendingDocuments: docs } =
        await getMediaForJob(jobId);
      setPendingInspection(pendingInspection);
      setPendingInstall(pendingInstall);
      setPendingDocuments(docs);
    } catch (err) {
      console.warn('[useOfflineMedia] refreshMedia failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    refreshMedia();
  }, [refreshMedia]);

  return {
    pendingInspectionPhotos,
    pendingInstallPhotos,
    pendingDocuments,
    pendingCount:
      pendingInspectionPhotos.length +
      pendingInstallPhotos.length +
      pendingDocuments.length,
    isLoading,
    refreshMedia,
  };
}
