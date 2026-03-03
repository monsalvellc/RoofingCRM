import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCustomer,
  getAllCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
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
  return useQuery<Customer, Error>({
    queryKey: customerKeys.detail(id),
    queryFn: () => getCustomer(id),
    enabled: !!id,
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

/** Partially updates an existing customer. Invalidates all customer queries on success. */
export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string; data: Partial<Omit<Customer, 'id'>> }>({
    mutationFn: ({ id, data }) => updateCustomer(id, data),
    onSuccess: (_result, { id }) => {
      // Invalidate the specific detail entry and all list queries.
      queryClient.invalidateQueries({ queryKey: customerKeys.detail(id) });
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
