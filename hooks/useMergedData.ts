/**
 * Merged data hooks — fuse Firestore (React Query) results with locally-vaulted
 * entities so that jobs and customers created offline appear immediately in the
 * pipeline and customer lists without waiting for a server round-trip.
 *
 * Deduplication: local entities whose `id` already appears in the Firestore
 * result are discarded. This prevents duplicates once the Firestore in-memory
 * cache or server confirms the write. Local-only entities always carry
 * `isOfflineLead: true` so the UI can render SyncBadge indicators on them.
 */

import { useEffect, useState } from 'react';
import { useGetAllJobs, jobKeys } from './useJobs';
import { useGetAllCustomers, customerKeys } from './useCustomers';
import { getLocalEntities } from '../utils/localVault';
import { useQueryClient } from '@tanstack/react-query';
import type { Job } from '../types/job';
import type { Customer } from '../types/customer';

// ─── useMergedAllJobs ─────────────────────────────────────────────────────────

/**
 * Drop-in replacement for `useGetAllJobs` that also surfaces offline-vaulted
 * jobs. The returned array is sorted newest-first and is safe to use anywhere
 * `useGetAllJobs` was previously used.
 */
export function useMergedAllJobs(companyId: string): {
  data: Job[];
  isLoading: boolean;
  error: Error | null;
} {
  const queryClient = useQueryClient();
  const { data: remoteJobs = [], isLoading, error } = useGetAllJobs(companyId);
  const [localJobs, setLocalJobs] = useState<Job[]>([]);

  // Re-read the vault whenever remote data refreshes so newly-synced items
  // disappear from the "pending" list as soon as Firestore confirms them.
  useEffect(() => {
    getLocalEntities<Job>('jobs').then((entities) => {
      // Only keep entities for this company — other companies' data may be
      // vaulted on a shared device.
      const filtered = entities.filter(
        (e) => !companyId || e.companyId === companyId,
      );
      setLocalJobs(filtered);

      // Remove vault entries that now exist in the Firestore result —
      // the server confirmed the write, so the local copy is redundant.
      // We do this asynchronously so it never blocks the render.
      if (remoteJobs.length > 0) {
        const remoteIds = new Set(remoteJobs.map((j) => j.id));
        filtered.forEach((local) => {
          if (remoteIds.has(local.id)) {
            import('../utils/localVault').then(({ deleteLocalEntity }) => {
              deleteLocalEntity('jobs', local.id);
            });
          }
        });
      }
    });
  }, [remoteJobs, companyId]);

  // Also listen for manual vault invalidations (e.g. after sync).
  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe(() => {
      const state = queryClient.getQueryState(jobKeys.byCompany(companyId));
      if (state?.status === 'success') {
        getLocalEntities<Job>('jobs').then((entities) => {
          setLocalJobs(entities.filter((e) => !companyId || e.companyId === companyId));
        });
      }
    });
    return unsubscribe;
  }, [queryClient, companyId]);

  const remoteIds = new Set(remoteJobs.map((j) => j.id));
  const pendingLocalJobs = localJobs.filter((j) => !remoteIds.has(j.id));

  const merged = [...pendingLocalJobs, ...remoteJobs].sort((a, b) => {
    const ta = typeof a.createdAt === 'string' ? new Date(a.createdAt).getTime() : Number(a.createdAt ?? 0);
    const tb = typeof b.createdAt === 'string' ? new Date(b.createdAt).getTime() : Number(b.createdAt ?? 0);
    return tb - ta;
  });

  return { data: merged, isLoading, error };
}

// ─── useMergedAllCustomers ────────────────────────────────────────────────────

/**
 * Drop-in replacement for `useGetAllCustomers` that also surfaces
 * offline-vaulted customers.
 */
export function useMergedAllCustomers(companyId: string): {
  data: Customer[];
  isLoading: boolean;
  error: Error | null;
} {
  const queryClient = useQueryClient();
  const { data: remoteCustomers = [], isLoading, error } = useGetAllCustomers(companyId);
  const [localCustomers, setLocalCustomers] = useState<Customer[]>([]);

  useEffect(() => {
    getLocalEntities<Customer>('customers').then((entities) => {
      const filtered = entities.filter(
        (e) => !companyId || e.companyId === companyId,
      );
      setLocalCustomers(filtered);

      if (remoteCustomers.length > 0) {
        const remoteIds = new Set(remoteCustomers.map((c) => c.id));
        filtered.forEach((local) => {
          if (remoteIds.has(local.id)) {
            import('../utils/localVault').then(({ deleteLocalEntity }) => {
              deleteLocalEntity('customers', local.id);
            });
          }
        });
      }
    });
  }, [remoteCustomers, companyId]);

  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe(() => {
      const state = queryClient.getQueryState(customerKeys.byCompany(companyId));
      if (state?.status === 'success') {
        getLocalEntities<Customer>('customers').then((entities) => {
          setLocalCustomers(entities.filter((e) => !companyId || e.companyId === companyId));
        });
      }
    });
    return unsubscribe;
  }, [queryClient, companyId]);

  const remoteIds = new Set(remoteCustomers.map((c) => c.id));
  // Tag vault-only customers with _localOnly so the UI can show SyncBadge
  // without relying on the permanent isOfflineLead Firestore field.
  const pendingLocalCustomers = localCustomers
    .filter((c) => !remoteIds.has(c.id))
    .map((c) => ({ ...c, _localOnly: true }));

  const merged = [...pendingLocalCustomers, ...remoteCustomers].sort((a, b) => {
    const ta = typeof a.createdAt === 'string' ? new Date(a.createdAt).getTime() : Number(a.createdAt ?? 0);
    const tb = typeof b.createdAt === 'string' ? new Date(b.createdAt).getTime() : Number(b.createdAt ?? 0);
    return tb - ta;
  });

  return { data: merged, isLoading, error };
}
