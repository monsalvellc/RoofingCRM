import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import { COLLECTIONS } from '../constants/config';
import {
  getJob,
  getJobsByCustomerId,
  getAllJobs,
  createJob,
  updateJob,
  deleteJob,
  createAdditionalJob,
  appendJobMedia,
  appendJobFile,
  replaceJobFiles,
  replaceJobMedia,
  uploadJobPhoto,
  uploadJobDocument,
  deleteStorageFile,
  type AdditionalJobPayload,
} from '../services';
import type { Job, JobFile, JobMedia } from '../types/job';

// ─── Query Keys ───────────────────────────────────────────────────────────────
// Centralised here so mutations and queries always use an identical key shape.
// Invalidating ['jobs'] cascades to every sub-key below it automatically.

export const jobKeys = {
  all: ['jobs'] as const,
  byCompany: (companyId: string) => ['jobs', 'all', companyId] as const,
  byCustomer: (customerId: string) => ['jobs', 'byCustomer', customerId] as const,
  detail: (id: string) => ['jobs', id] as const,
};

// ─── Query Hooks ──────────────────────────────────────────────────────────────

/** Fetches a single job by ID. Query is skipped if `id` is falsy. */
export function useGetJob(id: string) {
  return useQuery<Job, Error>({
    queryKey: jobKeys.detail(id),
    queryFn: () => getJob(id),
    enabled: !!id,
  });
}

/** Fetches all active jobs linked to a specific customer. */
export function useGetJobsByCustomerId(customerId: string) {
  return useQuery<Job[], Error>({
    queryKey: jobKeys.byCustomer(customerId),
    queryFn: () => getJobsByCustomerId(customerId),
    enabled: !!customerId,
  });
}

/** Fetches all active jobs for a company. Used by the pipeline / dashboard. */
export function useGetAllJobs(companyId: string) {
  return useQuery<Job[], Error>({
    queryKey: jobKeys.byCompany(companyId),
    queryFn: () => getAllJobs(companyId),
    enabled: !!companyId,
  });
}

// ─── Real-time Listener ───────────────────────────────────────────────────────

/**
 * Subscribes to all jobs for a given customer using Firestore's onSnapshot.
 * Updates in real time whenever any job in the customer's portfolio changes.
 * Returns an empty array while `customerId` is falsy or while loading.
 */
export function useCustomerJobsListener(customerId: string) {
  const [jobs, setJobs] = useState<any[]>([]);

  useEffect(() => {
    if (!customerId) {
      setJobs([]);
      return;
    }
    const q = query(
      collection(db, COLLECTIONS.jobs),
      where('customerId', '==', customerId),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setJobs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [customerId]);

  return jobs;
}

// ─── Mutation Hooks ───────────────────────────────────────────────────────────

/** Creates a new job. Invalidates all job queries on success. */
export function useCreateJob() {
  const queryClient = useQueryClient();
  return useMutation<Job, Error, Omit<Job, 'id'>>({
    mutationFn: (data) => createJob(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobKeys.all });
    },
  });
}

/**
 * Creates a minimal linked job for an existing customer (status: Lead, financials: 0).
 * Invalidates all job queries on success and returns the new job's Firestore ID.
 */
export function useCreateAdditionalJob() {
  const queryClient = useQueryClient();
  return useMutation<string, Error, AdditionalJobPayload>({
    mutationFn: (payload) => createAdditionalJob(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobKeys.all });
    },
  });
}

type UpdateJobVars = {
  id: string;
  data: Partial<Omit<Job, 'id'>>;
  historyEntry?: { customerId: string; entry: string };
  audit?: { actor: { id: string; name: string; companyId: string }; action: string };
};

/** Partially updates an existing job. Invalidates all job queries on success.
 *  Also invalidates the customer detail query when a historyEntry is present,
 *  because the service layer writes the entry to the customer's jobHistory field —
 *  without this, the Job History card on the customer profile would show stale data.
 */
export function useUpdateJob() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, UpdateJobVars>({
    mutationFn: ({ id, data, historyEntry, audit }) => updateJob(id, data, historyEntry, audit),
    onSuccess: (_result, { id, historyEntry }) => {
      queryClient.invalidateQueries({ queryKey: jobKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: jobKeys.all });
      // If a history entry was written to the customer doc, invalidate that
      // customer's cached data so the Job History card reflects the change.
      if (historyEntry?.customerId) {
        queryClient.invalidateQueries({ queryKey: ['customers', historyEntry.customerId] });
      }
    },
  });
}

/** Soft-deletes a job. Invalidates all job queries on success. */
export function useDeleteJob() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => deleteJob(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobKeys.all });
    },
  });
}

// ─── Media Mutation Hooks ─────────────────────────────────────────────────────

type UploadJobMediaVars = {
  jobId: string;
  photoType: 'inspectionPhotos' | 'installPhotos';
  uris: string[];
};

/**
 * Uploads one or more images to Firebase Storage and appends the resulting
 * JobMedia entries to the job's photo array using arrayUnion.
 * Invalidates jobKeys.detail(jobId) on success.
 */
export function useUploadJobMedia() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, UploadJobMediaVars>({
    mutationFn: async ({ jobId, photoType, uris }) => {
      const mediaItems = await Promise.all(
        uris.map((uri, i) => uploadJobPhoto(jobId, photoType, uri, String(i))),
      );
      await appendJobMedia(jobId, photoType, mediaItems);
    },
    onSuccess: (_result, { jobId }) => {
      queryClient.invalidateQueries({ queryKey: jobKeys.detail(jobId) });
    },
  });
}

type DeleteJobMediaVars = {
  jobId: string;
  media: JobMedia;
  updatedList: JobMedia[];
};

/**
 * Replaces the job's photo array with the provided list (minus the deleted item),
 * then best-effort deletes the file from Firebase Storage.
 * Invalidates jobKeys.detail(jobId) on success.
 */
export function useDeleteJobMedia() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, DeleteJobMediaVars>({
    mutationFn: async ({ jobId, media, updatedList }) => {
      const photoType =
        media.category === 'inspection' ? 'inspectionPhotos' : 'installPhotos';
      await replaceJobMedia(jobId, photoType, updatedList);
      await deleteStorageFile(media.url);
    },
    onSuccess: (_result, { jobId }) => {
      queryClient.invalidateQueries({ queryKey: jobKeys.detail(jobId) });
    },
  });
}

type AddJobDocumentVars = {
  jobId: string;
  uri: string;
  fileName: string;
};

/**
 * Uploads a document to Firebase Storage, constructs a JobFile record,
 * and appends it to the job's files array using arrayUnion.
 * Invalidates jobKeys.detail(jobId) on success.
 */
export function useAddJobDocument() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, AddJobDocumentVars>({
    mutationFn: async ({ jobId, uri, fileName }) => {
      const url = await uploadJobDocument(jobId, uri, fileName);
      const newDoc: JobFile = {
        id: Date.now().toString(),
        url,
        name: fileName,
        type: 'document',
        isSharedWithCustomer: false,
        createdAt: new Date().toISOString(),
      };
      await appendJobFile(jobId, newDoc);
    },
    onSuccess: (_result, { jobId }) => {
      queryClient.invalidateQueries({ queryKey: jobKeys.detail(jobId) });
    },
  });
}

type DeleteJobDocumentVars = {
  jobId: string;
  file: JobFile;
  updatedFiles: any[];
};

/**
 * Replaces the job's files array with the provided list (minus the deleted file),
 * then best-effort deletes the file from Firebase Storage.
 * Invalidates jobKeys.detail(jobId) on success.
 */
export function useDeleteJobDocument() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, DeleteJobDocumentVars>({
    mutationFn: async ({ jobId, file, updatedFiles }) => {
      await replaceJobFiles(jobId, updatedFiles);
      await deleteStorageFile(file.url);
    },
    onSuccess: (_result, { jobId }) => {
      queryClient.invalidateQueries({ queryKey: jobKeys.detail(jobId) });
    },
  });
}
