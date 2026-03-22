import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocFromCache,
  getDocs,
  getDocsFromCache,
  setDoc,
  updateDoc,
  query,
  where,
  type UpdateData,
  type DocumentData,
} from 'firebase/firestore';
import * as Network from 'expo-network';
import { db } from '../../config/firebaseConfig';
import { COLLECTIONS } from '../../constants/config';
import type { Job, JobFile, JobMedia } from '../../types/job';
import { createAuditLog } from './auditService';
import { saveLocalEntity, getLocalEntity } from '../../utils/localVault';

type AuditActor = { id: string; name: string; companyId: string };

// ─── Internal Helper ──────────────────────────────────────────────────────────

const toJob = (snap: { id: string; data: () => DocumentData }): Job =>
  ({ id: snap.id, ...snap.data() } as Job);

// ─── Network Helper ───────────────────────────────────────────────────────────

async function isOffline(): Promise<boolean> {
  const state = await Network.getNetworkStateAsync();
  return state.isConnected === false || state.isInternetReachable === false;
}

// ─── Read (cache-first) ───────────────────────────────────────────────────────

/**
 * Fetches a single job by document ID.
 * Tries the Firestore in-memory cache first — instant response when offline.
 * Falls back to a network fetch if the document is not cached.
 */
export async function getJob(id: string): Promise<Job> {
  const ref = doc(db, COLLECTIONS.jobs, id);

  // 1. Firestore in-memory cache — instant when offline.
  try {
    const cached = await getDocFromCache(ref);
    if (cached.exists()) return toJob(cached);
  } catch (_) {
    // Not cached — fall through to network.
  }

  // 2. Network fetch.
  let snap;
  try {
    snap = await getDoc(ref);
  } catch (error) {
    // Network error — fall through to vault.
    console.warn('[jobsService] getJob network fetch failed, checking vault:', error);
  }

  if (snap?.exists()) return toJob(snap);

  // 3. Local vault — covers offline-created jobs not yet synced.
  const vaultJob = await getLocalEntity<Job>(COLLECTIONS.jobs, id);
  if (vaultJob) return vaultJob;

  // 4. Truly not found anywhere.
  console.error(`[jobsService] getJob: "${id}" not in Firestore or vault`);
  throw new Error(`Job with ID "${id}" was not found.`);
}

/**
 * Fetches all active jobs for a specific customer. Cache-first.
 */
export async function getJobsByCustomerId(customerId: string): Promise<Job[]> {
  const q = query(
    collection(db, COLLECTIONS.jobs),
    where('customerId', '==', customerId),
    where('isDeleted', '==', false),
  );

  try {
    const cached = await getDocsFromCache(q);
    if (!cached.empty) return cached.docs.map(toJob);
  } catch (_) {
    // Cache miss — fall through.
  }

  try {
    const snap = await getDocs(q);
    return snap.docs.map(toJob);
  } catch (error) {
    console.error('[jobsService] getJobsByCustomerId failed:', error);
    throw new Error(`Failed to fetch jobs for customer "${customerId}". Please try again.`);
  }
}

/**
 * Fetches all active jobs for a company. Cache-first.
 */
export async function getAllJobs(companyId: string): Promise<Job[]> {
  const q = query(
    collection(db, COLLECTIONS.jobs),
    where('companyId', '==', companyId),
    where('isDeleted', '==', false),
  );

  try {
    const cached = await getDocsFromCache(q);
    if (!cached.empty) return cached.docs.map(toJob);
  } catch (_) {
    // Cache miss — fall through.
  }

  try {
    const snap = await getDocs(q);
    return snap.docs.map(toJob);
  } catch (error) {
    console.error('[jobsService] getAllJobs failed:', error);
    throw new Error(`Failed to fetch jobs for company "${companyId}". Please try again.`);
  }
}

// ─── User Preferences ─────────────────────────────────────────────────────────

export async function getHdPhotoQuality(userId: string): Promise<number> {
  if (!userId) return 0.75;
  const ref = doc(db, COLLECTIONS.users, userId);
  try {
    let snap;
    try {
      snap = await getDocFromCache(ref);
    } catch (_) {
      snap = await getDoc(ref);
    }
    const data = snap.data();
    return data?.allowHdToggle === true && data?.hdPhotosEnabled === true ? 1 : 0.75;
  } catch (error) {
    console.warn('[jobsService] getHdPhotoQuality — defaulting to 0.75:', error);
    return 0.75;
  }
}

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * Creates a new job document.
 *
 * - Pre-generates a Firestore document ID locally so the function can return
 *   the full Job object immediately without waiting for server acknowledgement.
 * - When offline, injects `isOfflineLead: true` into the document payload as a
 *   flag for downstream processing (e.g. geocoding, follow-up sync).
 * - The Firestore write is fire-and-forget: it hits the local cache
 *   synchronously and queues the server write for when connectivity returns.
 */
export async function createJob(
  data: Omit<Job, 'id'>,
  actor?: { id: string; name: string },
  presetId?: string,
): Promise<Job> {
  const now = new Date().toISOString();

  // 1. Use caller-supplied ID (for photo pre-association) or generate locally.
  const newId = presetId ?? doc(collection(db, COLLECTIONS.jobs)).id;

  const payload: Record<string, unknown> = {
    ...data,
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
  };

  // 2. True fire-and-forget — no await.
  setDoc(doc(db, COLLECTIONS.jobs, newId), payload).catch((e) =>
    console.warn('[jobsService] createJob pending sync:', e),
  );
  updateDoc(doc(db, COLLECTIONS.customers, data.customerId), {
    jobIds: arrayUnion(newId),
  }).catch((e) => console.warn('[jobsService] jobIds pending sync:', e));

  // 3. Non-blocking offline handling — resolves after we've already returned.
  isOffline().then((offline) => {
    if (offline) {
      const offlinePayload = { ...(payload as Record<string, unknown>), id: newId, isOfflineLead: true };
      // Vault write — survives app restarts.
      saveLocalEntity(COLLECTIONS.jobs, offlinePayload as Record<string, unknown> & { id: string });
      // Tag the Firestore local-cache doc.
      updateDoc(doc(db, COLLECTIONS.jobs, newId), { isOfflineLead: true }).catch(() => {});
    }
  });

  // 4. Non-blocking audit log.
  if (actor) {
    createAuditLog({
      companyId: data.companyId,
      entityId: newId,
      entityType: 'JOB',
      userId: actor.id,
      userName: actor.name,
      action: 'JOB_CREATED',
      message: `${actor.name} created job${data.jobName ? ` "${data.jobName}"` : ''}`,
    });
  }

  // 5. Instant return — useMutation sees Success in ~1ms.
  return { id: newId, ...(payload as Omit<Job, 'id'>) };
}

/** Payload for creating a minimal linked job for an existing customer. */
export interface AdditionalJobPayload {
  companyId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  assignedUserIds: string[];
  jobName?: string;
  jobType?: 'Retail' | 'Insurance';
}

/**
 * Creates a minimal new job for an existing customer (status: Lead, financials: 0).
 * Returns the new document ID immediately — fire-and-forget write.
 */
export async function createAdditionalJob(
  payload: AdditionalJobPayload,
  actor?: { id: string; name: string },
): Promise<string> {
  const now = new Date().toISOString();

  // 1. Generate ID locally — zero network activity.
  const newId = doc(collection(db, COLLECTIONS.jobs)).id;

  const docData: Record<string, unknown> = {
    ...payload,
    status: 'Lead',
    contractAmount: 0,
    balance: 0,
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
  };

  // 2. True fire-and-forget — no await.
  setDoc(doc(db, COLLECTIONS.jobs, newId), docData).catch((e) =>
    console.warn('[jobsService] createAdditionalJob pending sync:', e),
  );
  updateDoc(doc(db, COLLECTIONS.customers, payload.customerId), {
    jobIds: arrayUnion(newId),
  }).catch((e) => console.warn('[jobsService] jobIds pending sync:', e));

  // 3. Non-blocking offline handling — resolves after we've already returned.
  isOffline().then((offline) => {
    if (offline) {
      const offlineDoc = { ...docData, id: newId, isOfflineLead: true };
      saveLocalEntity(COLLECTIONS.jobs, offlineDoc as Record<string, unknown> & { id: string });
      updateDoc(doc(db, COLLECTIONS.jobs, newId), { isOfflineLead: true }).catch(() => {});
    }
  });

  // 4. Non-blocking audit log.
  if (actor) {
    createAuditLog({
      companyId: payload.companyId,
      entityId: newId,
      entityType: 'JOB',
      userId: actor.id,
      userName: actor.name,
      action: 'JOB_CREATED',
      message: `${actor.name} created job${payload.jobName ? ` "${payload.jobName}"` : ''} for ${payload.customerName}`,
    });
  }

  // 5. Instant return — useMutation sees Success in ~1ms.
  return newId;
}

// ─── Update (fire-and-forget) ─────────────────────────────────────────────────

/**
 * Partially updates a job document.
 *
 * All three writes (job fields, customer job-history entry, audit log) are
 * fire-and-forget: dispatched to the local cache immediately, queued for server
 * sync. The caller's UI updates without waiting for network acknowledgement.
 */
export async function updateJob(
  id: string,
  data: Partial<Omit<Job, 'id'>>,
  historyEntry?: { customerId: string; entry: string },
  audit?: { actor: AuditActor; action: string },
): Promise<void> {
  updateDoc(
    doc(db, COLLECTIONS.jobs, id),
    data as UpdateData<DocumentData>,
  ).catch((e) => console.warn('[jobsService] updateJob pending sync:', e));

  if (historyEntry) {
    updateDoc(doc(db, COLLECTIONS.customers, historyEntry.customerId), {
      jobHistory: arrayUnion(historyEntry.entry),
    }).catch((e) => console.warn('[jobsService] jobHistory pending sync:', e));
  }

  if (audit) {
    createAuditLog({
      companyId: audit.actor.companyId,
      entityId: id,
      entityType: 'JOB',
      userId: audit.actor.id,
      userName: audit.actor.name,
      action: audit.action,
      message: historyEntry?.entry ?? `${audit.actor.name} updated job`,
    });
  }
}

// ─── Media / File Mutations (fire-and-forget) ─────────────────────────────────

export async function appendJobMedia(
  jobId: string,
  photoType: 'inspectionPhotos' | 'installPhotos',
  media: JobMedia | JobMedia[],
): Promise<void> {
  const items = Array.isArray(media) ? media : [media];
  updateDoc(doc(db, COLLECTIONS.jobs, jobId), {
    [photoType]: arrayUnion(...items),
  }).catch((e) => console.warn('[jobsService] appendJobMedia pending sync:', e));
}

export async function appendJobFile(jobId: string, file: JobFile): Promise<void> {
  updateDoc(doc(db, COLLECTIONS.jobs, jobId), {
    files: arrayUnion(file),
  }).catch((e) => console.warn('[jobsService] appendJobFile pending sync:', e));
}

export async function replaceJobFiles(jobId: string, files: any[]): Promise<void> {
  updateDoc(doc(db, COLLECTIONS.jobs, jobId), { files }).catch((e) =>
    console.warn('[jobsService] replaceJobFiles pending sync:', e),
  );
}

export async function replaceJobMedia(
  jobId: string,
  photoType: 'inspectionPhotos' | 'installPhotos',
  media: JobMedia[],
): Promise<void> {
  updateDoc(doc(db, COLLECTIONS.jobs, jobId), { [photoType]: media }).catch((e) =>
    console.warn('[jobsService] replaceJobMedia pending sync:', e),
  );
}

// ─── Delete (Soft, fire-and-forget) ──────────────────────────────────────────

export async function deleteJob(id: string, actor?: AuditActor): Promise<void> {
  updateDoc(doc(db, COLLECTIONS.jobs, id), {
    isDeleted: true,
    updatedAt: new Date().toISOString(),
  }).catch((e) => console.warn('[jobsService] deleteJob pending sync:', e));

  if (actor) {
    createAuditLog({
      companyId: actor.companyId,
      entityId: id,
      entityType: 'JOB',
      userId: actor.id,
      userName: actor.name,
      action: 'JOB_DELETED',
      message: `${actor.name} deleted job`,
    });
  }
}
