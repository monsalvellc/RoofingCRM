import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import * as FileSystem from 'expo-file-system';
import * as Network from 'expo-network';
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
import { addToQueue } from '../utils/imageQueue';
import type { Job, JobFile, JobMedia } from '../types/job';

// ─── Query Keys ───────────────────────────────────────────────────────────────
export const jobKeys = {
  all: ['jobs'] as const,
  byCompany: (companyId: string) => ['jobs', 'all', companyId] as const,
  byCustomer: (customerId: string) => ['jobs', 'byCustomer', customerId] as const,
  detail: (id: string) => ['jobs', id] as const,
};

// ─── Query Hooks ──────────────────────────────────────────────────────────────
export function useGetJob(id: string) {
  const queryClient = useQueryClient();
  return useQuery<Job, Error>({
    queryKey: jobKeys.detail(id),
    queryFn: () => getJob(id),
    enabled: !!id,
    // Seed from the already-cached company list so the detail screen renders
    // immediately without a spinner — and dependent queries (useGetCustomer,
    // useCustomerJobsListener) can fire in parallel on the very first frame
    // instead of waiting for this query to settle first.
    initialData: (): Job | undefined => {
      if (!id) return undefined;
      const caches = queryClient.getQueriesData<Job[]>({ queryKey: ['jobs', 'all'] });
      for (const [, data] of caches) {
        if (!Array.isArray(data)) continue;
        const found = data.find((j) => j.id === id);
        if (found) return found;
      }
      return undefined;
    },
    // Propagate the source cache's age so React Query respects the global
    // staleTime and only triggers a background refetch when actually needed.
    initialDataUpdatedAt: () => {
      const caches = queryClient.getQueriesData<Job[]>({ queryKey: ['jobs', 'all'] });
      let newest = 0;
      for (const [key] of caches) {
        const t = queryClient.getQueryState(key)?.dataUpdatedAt ?? 0;
        if (t > newest) newest = t;
      }
      return newest;
    },
  });
}

export function useGetJobsByCustomerId(customerId: string) {
  return useQuery<Job[], Error>({
    queryKey: jobKeys.byCustomer(customerId),
    queryFn: () => getJobsByCustomerId(customerId),
    enabled: !!customerId,
  });
}

export function useGetAllJobs(companyId: string) {
  return useQuery<Job[], Error>({
    queryKey: jobKeys.byCompany(companyId),
    queryFn: () => getAllJobs(companyId),
    enabled: !!companyId,
  });
}

// ─── Real-time Listener ───────────────────────────────────────────────────────
export function useCustomerJobsListener(customerId: string, companyId: string) {
  const [jobs, setJobs] = useState<any[]>([]);

  useEffect(() => {
    if (!customerId || !companyId) {
      setJobs([]);
      return;
    }
    const q = query(
      collection(db, COLLECTIONS.jobs),
      where('customerId', '==', customerId),
      where('companyId', '==', companyId),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setJobs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [customerId, companyId]);

  return jobs;
}

// ─── Mutation Hooks ───────────────────────────────────────────────────────────
type CreateJobVars = Omit<Job, 'id'> & { presetId?: string; actor?: { id: string; name: string } };

export function useCreateJob() {
  const queryClient = useQueryClient();
  return useMutation<Job, Error, CreateJobVars>({
    mutationFn: (vars: CreateJobVars) => {
      const { presetId, actor, ...data } = vars;
      return createJob(data as Omit<Job, 'id'>, actor, presetId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobKeys.all });
    },
  });
}

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

export function useUpdateJob() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, UpdateJobVars>({
    mutationFn: ({ id, data, historyEntry, audit }) => updateJob(id, data, historyEntry, audit),
    onSuccess: (_result, { id, historyEntry }) => {
      queryClient.invalidateQueries({ queryKey: jobKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: jobKeys.all });
      if (historyEntry?.customerId) {
        queryClient.invalidateQueries({ queryKey: ['customers', historyEntry.customerId] });
      }
    },
  });
}

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
 * Uploads one or more images to Firebase Storage, then appends the resulting
 * JobMedia entries to the job document via arrayUnion.
 */
export function useUploadJobMedia() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, UploadJobMediaVars>({
    mutationFn: async ({ jobId, photoType, uris }) => {
      console.log(`\n📸 [UPLOAD HOOK] Triggered for Job: ${jobId} | Photos to process: ${uris.length}`);

      const state = await Network.getNetworkStateAsync();
      console.log(`📶 [UPLOAD HOOK] Network check: ${state.isConnected ? "ONLINE" : "OFFLINE"}`);

      // ── Offline path: queue everything and return immediately ─────────────
      if (!state.isConnected) {
        console.log(`📴 [UPLOAD HOOK] Device is offline. Adding ${uris.length} photos to local queue...`);
        try {
          await Promise.all(uris.map((uri) => addToQueue({ jobId, photoType, uri })));
          console.log(`✅ [UPLOAD HOOK] Successfully saved photos to offline queue.`);
        } catch (queueError) {
          console.error(`❌ [UPLOAD HOOK] CRASH inside addToQueue:`, queueError);
        }
        return;
      }

      // ── Online path: upload each URI independently ────────────────────────
      console.log(`🌐 [UPLOAD HOOK] Device is online. Attempting live upload...`);
      await Promise.all(
        uris.map(async (uri, i) => {
          try {
            console.log(`⏳ [UPLOAD HOOK] Uploading photo ${i + 1} of ${uris.length}...`);
            const uniqueId = String(Date.now() + i); 
            const media = await uploadJobPhoto(jobId, photoType, uri, uniqueId);
            
            console.log(`📝 [UPLOAD HOOK] Photo ${i + 1} uploaded to Storage. Appending to Firestore...`);
            await appendJobMedia(jobId, photoType, media);
            
            console.log(`🧹 [UPLOAD HOOK] Firestore updated. Deleting local cache for photo ${i + 1}...`);
            FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
          } catch (error: any) {
            console.warn(`⚠️ [UPLOAD HOOK] Live upload failed for photo ${i + 1}. Moving to offline queue. Error:`, error.message || error);
            try {
              await addToQueue({ jobId, photoType, uri });
              console.log(`✅ [UPLOAD HOOK] Successfully moved failed photo ${i + 1} to queue.`);
            } catch (fallbackQueueError) {
              console.error(`❌ [UPLOAD HOOK] Fallback queue failed:`, fallbackQueueError);
            }
          }
        }),
      );
    },
    onSuccess: (_result, { jobId }) => {
      console.log(`🔄 [UPLOAD HOOK] Mutation finished. Refreshing UI for Job: ${jobId}\n`);
      queryClient.invalidateQueries({ queryKey: jobKeys.detail(jobId) });
    },
    onError: (error) => {
      console.error(`💥 [UPLOAD HOOK] ENTIRE MUTATION CRASHED:`, error);
    }
  });
}

type DeleteJobMediaVars = {
  jobId: string;
  media: JobMedia;
  updatedList: JobMedia[];
};

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