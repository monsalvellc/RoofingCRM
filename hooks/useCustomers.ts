import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCustomer,
  getAllCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  deactivateCustomer,
  assignCustomerReps,
} from '../services';
import type { Customer } from '../types/customer';

// ─── Query Keys ───────────────────────────────────────────────────────────────
// Centralised here so mutations and queries always use an identical key shape.
// Invalidating ['customers'] cascades to every sub-key below it automatically.

export const customerKeys = {
  all: ['customers'] as const,
  byCompany: (companyId: string) => ['customers', 'all', companyId] as const,
  detail: (id: string) => ['customers', id] as const,
};

// ─── Query Hooks ──────────────────────────────────────────────────────────────

/** Fetches a single customer by ID. Query is skipped if `id` is falsy. */
export function useGetCustomer(id: string) {
  const queryClient = useQueryClient();
  return useQuery<Customer, Error>({
    queryKey: customerKeys.detail(id),
    queryFn: () => getCustomer(id),
    enabled: !!id,
    // Seed from the already-cached company list so the customer profile screen
    // renders immediately and dependent UI (assigned-rep chips, edit form) is
    // available on the first frame without a loading spinner.
    initialData: (): Customer | undefined => {
      if (!id) return undefined;
      const caches = queryClient.getQueriesData<Customer[]>({ queryKey: ['customers', 'all'] });
      for (const [, data] of caches) {
        if (!Array.isArray(data)) continue;
        const found = data.find((c) => c.id === id);
        if (found) return found;
      }
      return undefined;
    },
    initialDataUpdatedAt: () => {
      const caches = queryClient.getQueriesData<Customer[]>({ queryKey: ['customers', 'all'] });
      let newest = 0;
      for (const [key] of caches) {
        const t = queryClient.getQueryState(key)?.dataUpdatedAt ?? 0;
        if (t > newest) newest = t;
      }
      return newest;
    },
  });
}

/** Fetches all active customers for a company. */
export function useGetAllCustomers(companyId: string) {
  return useQuery<Customer[], Error>({
    queryKey: customerKeys.byCompany(companyId),
    queryFn: () => getAllCustomers(companyId),
    enabled: !!companyId,
  });
}

// ─── Mutation Hooks ───────────────────────────────────────────────────────────

type CreateCustomerVars = {
  data: Omit<Customer, 'id'>;
  creator?: { id: string; name: string } | null;
};

/** Creates a new customer. Invalidates all customer queries on success. */
export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation<Customer, Error, CreateCustomerVars>({
    mutationFn: ({ data, creator }) => createCustomer(data, creator),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all });
    },
  });
}

type UpdateCustomerVars = {
  id: string;
  data: Partial<Omit<Customer, 'id'>>;
  /** Optional history string appended to the customer's jobHistory array via arrayUnion. */
  historyEntry?: string;
  /** Optional actor for audit_log writing. Omit when no auth context is available. */
  actor?: { id: string; name: string; companyId: string };
};

/** Partially updates an existing customer. Supports optional history and audit logging. */
export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, UpdateCustomerVars>({
    mutationFn: ({ id, data, actor, historyEntry }) =>
      updateCustomer(id, data, actor, historyEntry),
    onSuccess: (_result, { id }) => {
      // Invalidate the specific detail entry and all list queries so the UI
      // reflects the saved data and the Job History card refreshes.
      queryClient.invalidateQueries({ queryKey: customerKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: customerKeys.all });
    },
  });
}

/**
 * Hides a customer (and all their jobs) from the pipeline by setting isHidden: true.
 * The record is NOT deleted. Accepts an optional actor for audit logging.
 */
export function useDeactivateCustomer() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string; actor?: { id: string; name: string; companyId: string } }>({
    mutationFn: ({ id, actor }) => deactivateCustomer(id, actor),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all });
    },
  });
}

/** Soft-deletes a customer. Invalidates all customer queries on success. */
export function useDeleteCustomer() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => deleteCustomer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all });
    },
  });
}

type AssignCustomerRepsVars = {
  customerId: string;
  selectedUserIds: string[];
  historyEntry: string;
};

/**
 * Updates the customer's assigned reps and syncs the change to all associated jobs.
 * Invalidates the customer detail and all customer list queries on success.
 */
export function useAssignCustomerReps() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, AssignCustomerRepsVars>({
    mutationFn: ({ customerId, selectedUserIds, historyEntry }) =>
      assignCustomerReps(customerId, selectedUserIds, historyEntry),
    onSuccess: (_result, { customerId }) => {
      queryClient.invalidateQueries({ queryKey: customerKeys.detail(customerId) });
      queryClient.invalidateQueries({ queryKey: customerKeys.all });
    },
  });
}
