/**
 * SyncContext — global sync engine for offline media.
 *
 * Provides:
 *   ledger      — jobId → pending file count (from AsyncStorage, instant reads).
 *   activeSyncs — jobId → boolean, true while that job is uploading.
 *   addPending  — increment ledger + state after a vault save.
 *   triggerSync — upload all vault files for a job, then clear the ledger entry.
 *
 * Wrap the app in <SyncProvider> (inside QueryClientProvider so it can call
 * queryClient.invalidateQueries).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { doc, setDoc } from 'firebase/firestore';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '../config/firebaseConfig';
import { COLLECTIONS } from '../constants/config';
import {
  getLedger,
  incrementLedger,
  decrementLedger,
  clearLedger,
} from '../utils/syncLedger';
import {
  getMediaForJob,
  deleteMediaFromVault,
  MEDIA_VAULT_ROOT,
} from '../utils/mediaVault';
import {
  uploadJobPhoto,
  appendJobMedia,
  uploadJobDocument,
  appendJobFile,
} from '../services';
import { processMediaQueue } from '../services/mediaQueueService';
import { jobKeys } from '../hooks/useJobs';
import type { JobFile } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SyncContextValue {
  /** jobId → number of files pending upload. Zero-cost badge reads. */
  ledger: Record<string, number>;
  /** jobId → true while that job's sync is in flight. */
  activeSyncs: Record<string, boolean>;
  /**
   * Record that one or more files were saved to the vault for `jobId`.
   * Updates both AsyncStorage and the in-memory ledger atomically.
   */
  addPending(jobId: string, count: number): Promise<void>;
  /**
   * Upload all vaulted files for `jobId` to Firebase Storage, append the
   * cloud URLs to Firestore, delete the local copies, and clear the ledger.
   *
   * @param jobId       The job to sync.
   * @param onComplete  Optional callback — typically `refreshMedia()` from
   *                    useOfflineMedia so the job detail gallery updates.
   */
  triggerSync(jobId: string, onComplete?: () => void): Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const SyncContext = createContext<SyncContextValue | null>(null);

export function useSyncContext(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSyncContext must be used inside <SyncProvider>');
  return ctx;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true if the Firebase error signals the parent document no longer
 * exists (job/customer deleted on the server while the device was offline).
 * Checks both the FirebaseError `code` property and the message string so it
 * works across SDK versions and both Firestore / Storage layers.
 */
function isJobNotFoundError(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const code = (err as any).code as string | undefined;
    if (code === 'not-found' || code === 'firestore/not-found') return true;
    if (err instanceof Error) {
      const msg = err.message.toLowerCase();
      return msg.includes('not-found') || msg.includes('no document');
    }
  }
  return false;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function SyncProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [ledger, setLedger] = useState<Record<string, number>>({});
  const [activeSyncs, setActiveSyncs] = useState<Record<string, boolean>>({});

  // Load persisted ledger on mount.
  useEffect(() => {
    getLedger().then(setLedger);
  }, []);

  // ── addPending ──────────────────────────────────────────────────────────────

  const addPending = useCallback(async (jobId: string, count: number) => {
    await incrementLedger(jobId, count);
    // Optimistic in-memory update — no need to re-read AsyncStorage.
    setLedger((prev) => ({
      ...prev,
      [jobId]: (prev[jobId] ?? 0) + count,
    }));
  }, []);

  // ── triggerSync ─────────────────────────────────────────────────────────────

  const triggerSync = useCallback(
    async (jobId: string, onComplete?: () => void) => {
      if (activeSyncs[jobId]) return; // already in flight

      setActiveSyncs((prev) => ({ ...prev, [jobId]: true }));

      // ── Per-file helpers ───────────────────────────────────────────────────
      // Decrement ledger by 1 in both AsyncStorage and in-memory state after a
      // file is confirmed deleted. Keeps badges accurate on interrupted syncs.
      const onFileSuccess = async () => {
        await decrementLedger(jobId, 1);
        setLedger((prev) => {
          const current = prev[jobId] ?? 1;
          const next = current - 1;
          if (next <= 0) {
            const { [jobId]: _removed, ...rest } = prev;
            return rest;
          }
          return { ...prev, [jobId]: next };
        });
      };

      // Shared upload helpers — used in both the initial loop and the
      // post-recovery resume so identical logic is not duplicated.
      const uploadInspection = async (uri: string) => {
        const media = await uploadJobPhoto(jobId, 'inspectionPhotos', uri, `inspection_${Date.now()}`);
        await appendJobMedia(jobId, 'inspectionPhotos', media);
        await deleteMediaFromVault(uri);
        await onFileSuccess();
      };

      const uploadInstall = async (uri: string) => {
        const media = await uploadJobPhoto(jobId, 'installPhotos', uri, `install_${Date.now()}`);
        await appendJobMedia(jobId, 'installPhotos', media);
        await deleteMediaFromVault(uri);
        await onFileSuccess();
      };

      const uploadDocument = async (uri: string, name: string) => {
        const url = await uploadJobDocument(jobId, uri, name);
        const newFile: JobFile = {
          id: `doc_${Date.now()}`,
          url,
          name,
          type: 'document',
          isSharedWithCustomer: false,
          createdAt: new Date().toISOString(),
        };
        await appendJobFile(jobId, newFile);
        await deleteMediaFromVault(uri);
        await onFileSuccess();
      };

      // ── Ghost-job alert ────────────────────────────────────────────────────
      // Wrapped in a Promise so the async loop can await the user's decision.
      // Returns 'delete' or 'recreate' based on the button tapped.
      const handleGhostJob = (): Promise<'delete' | 'recreate'> =>
        new Promise((resolve) => {
          Alert.alert(
            'Job Missing From Server',
            'This lead was deleted from the system, but you still have unsynced photos. What would you like to do?',
            [
              {
                text: 'Cancel & Delete Photos',
                style: 'destructive',
                onPress: () => resolve('delete'),
              },
              {
                text: 'Sync & Create Job',
                onPress: () => resolve('recreate'),
              },
            ],
          );
        });

      try {
        const { pendingInspection, pendingInstall, pendingDocuments } =
          await getMediaForJob(jobId);

        let uploaded = 0;
        let ghostDetected = false;

        // These capture everything left to upload from the point of failure
        // onwards (including the file that caused the not-found error) so the
        // resume path can retry it after the job document is recreated.
        let remainingInspection: string[] = [];
        let remainingInstall: string[] = [];
        let remainingDocuments: { uri: string; name: string }[] = [];

        // ── Phase 1: Inspection photos ──────────────────────────────────────
        for (let i = 0; i < pendingInspection.length; i++) {
          const uri = pendingInspection[i];
          try {
            await uploadInspection(uri);
            uploaded++;
          } catch (err) {
            if (isJobNotFoundError(err)) {
              ghostDetected = true;
              remainingInspection = pendingInspection.slice(i); // retry from here
              remainingInstall = [...pendingInstall];
              remainingDocuments = [...pendingDocuments];
              break;
            }
            console.warn('[SyncContext] inspection photo failed:', uri, err);
          }
        }

        // ── Phase 2: Install photos ─────────────────────────────────────────
        if (!ghostDetected) {
          for (let i = 0; i < pendingInstall.length; i++) {
            const uri = pendingInstall[i];
            try {
              await uploadInstall(uri);
              uploaded++;
            } catch (err) {
              if (isJobNotFoundError(err)) {
                ghostDetected = true;
                // Phase 1 already completed; only capture from this point on.
                remainingInstall = pendingInstall.slice(i);
                remainingDocuments = [...pendingDocuments];
                break;
              }
              console.warn('[SyncContext] install photo failed:', uri, err);
            }
          }
        }

        // ── Phase 3: Documents ──────────────────────────────────────────────
        if (!ghostDetected) {
          for (let i = 0; i < pendingDocuments.length; i++) {
            const { uri, name } = pendingDocuments[i];
            try {
              await uploadDocument(uri, name);
              uploaded++;
            } catch (err) {
              if (isJobNotFoundError(err)) {
                ghostDetected = true;
                // Phases 1 & 2 already completed.
                remainingDocuments = pendingDocuments.slice(i);
                break;
              }
              console.warn('[SyncContext] document failed:', uri, err);
            }
          }
        }

        // ── Ghost-job recovery ──────────────────────────────────────────────
        if (ghostDetected) {
          const action = await handleGhostJob();

          if (action === 'delete') {
            // Permanently remove local vault folder and clear the sync badge.
            try {
              await FileSystem.deleteAsync(`${MEDIA_VAULT_ROOT}${jobId}/`, { idempotent: true });
              await clearLedger(jobId);
            } catch (cleanupErr) {
              console.warn('[SyncContext] ghost-job delete cleanup failed:', cleanupErr);
            }
            setLedger((prev) => {
              const { [jobId]: _removed, ...rest } = prev;
              return rest;
            });
            return; // finally will clear activeSyncs
          }

          // ── 'recreate' path ─────────────────────────────────────────────
          // Write a skeleton job document with the original Firestore ID using
          // an AWAITED setDoc so the document lands in the local Firestore
          // cache before appendJobMedia / appendJobFile are called. This lets
          // uploads succeed even while the device is still offline.
          const now = new Date().toISOString();
          await setDoc(doc(db, COLLECTIONS.jobs, jobId), {
            jobId,
            customerId: 'unknown',
            companyId: 'unknown',
            assignedUserIds: [],
            status: 'Lead',
            jobName: 'Recovered Offline Job',
            jobType: 'Retail',
            trades: [],
            contractAmount: 0,
            depositAmount: 0,
            isDepositPaid: false,
            payments: [],
            balance: 0,
            mainMaterialCost: 0,
            additionalSpent: [],
            returnedMaterialCredit: 0,
            installersCost: 0,
            guttersCost: 0,
            files: [],
            folderPermissions: {},
            inspectionPhotos: [],
            installPhotos: [],
            isDeleted: false,
            createdAt: now,
            updatedAt: now,
          });

          // Resume from the file that triggered the not-found error.
          for (const uri of remainingInspection) {
            try { await uploadInspection(uri); uploaded++; }
            catch (err) { console.warn('[SyncContext] post-recovery inspection failed:', uri, err); }
          }
          for (const uri of remainingInstall) {
            try { await uploadInstall(uri); uploaded++; }
            catch (err) { console.warn('[SyncContext] post-recovery install failed:', uri, err); }
          }
          for (const { uri, name } of remainingDocuments) {
            try { await uploadDocument(uri, name); uploaded++; }
            catch (err) { console.warn('[SyncContext] post-recovery document failed:', uri, err); }
          }
        }

        if (uploaded > 0) {
          queryClient.invalidateQueries({ queryKey: jobKeys.detail(jobId) });
          queryClient.invalidateQueries({ queryKey: jobKeys.all });
        }

        // Drain the async media queue (comment-annotated photos staged via
        // addToMediaQueue). Runs globally — clears all pending items, not just
        // the current jobId, so one sync pass handles everything.
        await processMediaQueue((updatedJobId) => {
          queryClient.invalidateQueries({ queryKey: jobKeys.detail(updatedJobId) });
          queryClient.invalidateQueries({ queryKey: jobKeys.all });
        });

        onComplete?.();
      } finally {
        setActiveSyncs((prev) => ({ ...prev, [jobId]: false }));
      }
    },
    [activeSyncs, queryClient],
  );

  return (
    <SyncContext.Provider value={{ ledger, activeSyncs, addPending, triggerSync }}>
      {children}
    </SyncContext.Provider>
  );
}
