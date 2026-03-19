import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  type UpdateData,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../../config/firebaseConfig';
import { COLLECTIONS } from '../../constants/config';
import type { Job, JobFile, JobMedia } from '../../types/job';
import { createAuditLog } from './auditService';

type AuditActor = { id: string; name: string; companyId: string };

// ─── Internal Helper ──────────────────────────────────────────────────────────

/**
 * Maps a raw Firestore document snapshot to a strictly-typed Job.
 * The document ID is injected as `id` since Firestore stores it separately.
 */
const toJob = (snap: { id: string; data: () => DocumentData }): Job =>
  ({ id: snap.id, ...snap.data() } as Job);

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Fetches a single job by document ID.
 * @throws If the document does not exist or the Firestore call fails.
 */
export async function getJob(id: string): Promise<Job> {
  let snap;
  try {
    snap = await getDoc(doc(db, COLLECTIONS.jobs, id));
  } catch (error) {
    console.error('[jobsService] getJob failed:', error);
    throw new Error(`Failed to fetch job "${id}". Please try again.`);
  }

  if (!snap.exists()) {
    throw new Error(`Job with ID "${id}" was not found.`);
  }

  return toJob(snap);
}

/**
 * Fetches all active (non-deleted) jobs linked to a specific customer.
 * @throws If the Firestore query fails.
 */
export async function getJobsByCustomerId(customerId: string): Promise<Job[]> {
  try {
    const q = query(
      collection(db, COLLECTIONS.jobs),
      where('customerId', '==', customerId),
      where('isDeleted', '==', false),
    );
    const snap = await getDocs(q);
    return snap.docs.map(toJob);
  } catch (error) {
    console.error('[jobsService] getJobsByCustomerId failed:', error);
    throw new Error(`Failed to fetch jobs for customer "${customerId}". Please try again.`);
  }
}

/**
 * Fetches all active (non-deleted) jobs belonging to a company.
 * Used for the pipeline/dashboard view.
 * @throws If the Firestore query fails.
 */
export async function getAllJobs(companyId: string): Promise<Job[]> {
  try {
    const q = query(
      collection(db, COLLECTIONS.jobs),
      where('companyId', '==', companyId),
      where('isDeleted', '==', false),
    );
    const snap = await getDocs(q);
    return snap.docs.map(toJob);
  } catch (error) {
    console.error('[jobsService] getAllJobs failed:', error);
    throw new Error(`Failed to fetch jobs for company "${companyId}". Please try again.`);
  }
}

// ─── User Preferences ─────────────────────────────────────────────────────────

/**
 * Fetches the HD photo quality preference for a user.
 * Returns 1.0 (full quality) if the user has HD enabled, 0.75 (compressed) otherwise.
 * Falls back to 0.75 on any error so uploads are never blocked.
 */
export async function getHdPhotoQuality(userId: string): Promise<number> {
  if (!userId) return 0.75;
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.users, userId));
    const data = snap.data();
    const isHd = data?.allowHdToggle === true && data?.hdPhotosEnabled === true;
    return isHd ? 1 : 0.75;
  } catch (error) {
    console.warn('[jobsService] getHdPhotoQuality failed — defaulting to 0.75:', error);
    return 0.75;
  }
}

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * Creates a new job document. Firestore auto-generates the document ID.
 * Returns the full Job object including the generated ID.
 * @throws If the Firestore write fails.
 */

    export async function createJob(
      data: Omit<Job, 'id'>,
      actor?: { id: string; name: string },
    ): Promise<Job> {
      try {
        const now = new Date().toISOString();
        const payload = { ...data, isDeleted: false, createdAt: now, updatedAt: now };
        const ref = await addDoc(collection(db, COLLECTIONS.jobs), payload);
        if (actor) {
          await createAuditLog({
            companyId: data.companyId,
            entityId: ref.id,
            entityType: 'JOB',
            userId: actor.id,
            userName: actor.name,
            action: 'JOB_CREATED',
            message: `${actor.name} created job${data.jobName ? ` "${data.jobName}"` : ''}`,
          });
        }
        return { id: ref.id, ...payload };
      } catch (error) {
        console.error('[jobsService] createJob failed:', error);
        throw new Error('Failed to create job. Please try again.');
      }
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
 * Creates a minimal new job document for an existing customer.
 * Status defaults to 'Lead' and all financials to 0.
 * Returns the new Firestore document ID.
 * @throws If the Firestore write fails.
 */
  export async function createAdditionalJob(
    payload: AdditionalJobPayload,
    actor?: { id: string; name: string },
  ): Promise<string> {
    try {
      const now = new Date().toISOString();
      const docRef = await addDoc(collection(db, COLLECTIONS.jobs), {
        ...payload,
        status: 'Lead',
        contractAmount: 0,
        balance: 0,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      if (actor) {
        await createAuditLog({
          companyId: payload.companyId,
          entityId: docRef.id,
          entityType: 'JOB',
          userId: actor.id,
          userName: actor.name,
          action: 'JOB_CREATED',
          message: `${actor.name} created job${payload.jobName ? ` "${payload.jobName}"` : ''} for ${payload.customerName}`,
        });
      }
      return docRef.id;
    } catch (error) {
      console.error('[jobsService] createAdditionalJob failed:', error);
      throw new Error('Failed to create job. Please try again.');
    }
  }

// ─── Update ───────────────────────────────────────────────────────────────────

/**
 * Performs a partial update on an existing job document.
 * Only the fields provided in `data` are modified; all others remain unchanged.
 * @throws If the document does not exist or the Firestore write fails.
 */
export async function updateJob(
  id: string,
  data: Partial<Omit<Job, 'id'>>,
  historyEntry?: { customerId: string; entry: string },
  audit?: { actor: AuditActor; action: string },
): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.jobs, id), data as UpdateData<DocumentData>);
    if (historyEntry) {
      await updateDoc(doc(db, COLLECTIONS.customers, historyEntry.customerId), {
        jobHistory: arrayUnion(historyEntry.entry),
      });
    }
    if (audit) {
      await createAuditLog({
        companyId: audit.actor.companyId,
        entityId: id,
        entityType: 'JOB',
        userId: audit.actor.id,
        userName: audit.actor.name,
        action: audit.action,
        message: historyEntry?.entry ?? `${audit.actor.name} updated job`,
      });
    }
  } catch (error) {
    console.error('[jobsService] updateJob failed:', error);
    throw new Error(`Failed to update job "${id}". Please try again.`);
  }
}

// ─── Media / File Mutations ───────────────────────────────────────────────────

/**
 * Appends one or more JobMedia items to a job's photo array using arrayUnion.
 * This is atomic — existing items are never overwritten.
 */
export async function appendJobMedia(
  jobId: string,
  photoType: 'inspectionPhotos' | 'installPhotos',
  media: JobMedia | JobMedia[],
): Promise<void> {
  try {
    const items = Array.isArray(media) ? media : [media];
    await updateDoc(doc(db, COLLECTIONS.jobs, jobId), {
      [photoType]: arrayUnion(...items),
    });
  } catch (error) {
    console.error('[jobsService] appendJobMedia failed:', error);
    throw new Error('Failed to save photo. Please try again.');
  }
}

/**
 * Appends a single JobFile to a job's files array using arrayUnion.
 */
export async function appendJobFile(jobId: string, file: JobFile): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.jobs, jobId), {
      files: arrayUnion(file),
    });
  } catch (error) {
    console.error('[jobsService] appendJobFile failed:', error);
    throw new Error('Failed to save file. Please try again.');
  }
}

/**
 * Replaces a job's entire files array.
 * Used to remove a document — the caller filters the deleted item out first.
 */
export async function replaceJobFiles(jobId: string, files: any[]): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.jobs, jobId), { files });
  } catch (error) {
    console.error('[jobsService] replaceJobFiles failed:', error);
    throw new Error('Failed to update files. Please try again.');
  }
}

/**
 * Replaces a job's entire photo array for a given photo type.
 * Used to remove a photo — the caller filters the deleted item out first.
 */
export async function replaceJobMedia(
  jobId: string,
  photoType: 'inspectionPhotos' | 'installPhotos',
  media: JobMedia[],
): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.jobs, jobId), { [photoType]: media });
  } catch (error) {
    console.error('[jobsService] replaceJobMedia failed:', error);
    throw new Error('Failed to update photos. Please try again.');
  }
}

// ─── Delete (Soft) ────────────────────────────────────────────────────────────

/**
 * Soft-deletes a job by setting `isDeleted: true` and stamping `updatedAt`.
 * The document is retained in Firestore for audit/recovery purposes.
 * @throws If the Firestore write fails.
 */
export async function deleteJob(id: string, actor?: AuditActor): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.jobs, id), {
      isDeleted: true,
      updatedAt: new Date().toISOString(),
    });
    if (actor) {
      await createAuditLog({
        companyId: actor.companyId,
        entityId: id,
        entityType: 'JOB',
        userId: actor.id,
        userName: actor.name,
        action: 'JOB_DELETED',
        message: `${actor.name} deleted job`,
      });
    }
  } catch (error) {
    console.error('[jobsService] deleteJob failed:', error);
    throw new Error(`Failed to delete job "${id}". Please try again.`);
  }
}
