import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { auth } from '../config/firebaseConfig';
import {
  getHdPhotoQuality,
  getCompanyUsers,
  updateUserProfile,
  getCompany,
  getSalesReps,
  createRepProfile,
  createAuthUserSecondary,
} from '../services';
import type { CompanyUser } from '../services';
import type { Company, SalesRep } from '../types';

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const userKeys = {
  all: ['users'] as const,
  hdQuality: (uid: string) => ['users', uid, 'hdQuality'] as const,
  companyUsers: (companyId: string) => ['users', 'company', companyId] as const,
  salesReps: (companyId: string) => ['users', 'salesReps', companyId] as const,
  company: (companyId: string) => ['company', companyId] as const,
};

// ─── Query Hooks ──────────────────────────────────────────────────────────────

/**
 * Returns the current authenticated user's HD photo quality setting.
 * Resolves to 1.0 (full quality) or 0.75 (compressed). Defaults to 0.75
 * while loading or on error so image picks are never blocked.
 *
 * Cached for 5 minutes — the user preference rarely changes mid-session.
 */
export function useHdPhotoQuality() {
  const uid = auth.currentUser?.uid ?? '';
  return useQuery<number, Error>({
    queryKey: userKeys.hdQuality(uid),
    queryFn: () => getHdPhotoQuality(uid),
    enabled: !!uid,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Fetches all users belonging to a company.
 * Returns a list of { id, name } objects. Query is skipped if `companyId` is falsy.
 */
export function useGetCompanyUsers(companyId: string) {
  return useQuery<CompanyUser[], Error>({
    queryKey: userKeys.companyUsers(companyId),
    queryFn: () => getCompanyUsers(companyId),
    enabled: !!companyId,
  });
}

// ─── Mutation Hooks ───────────────────────────────────────────────────────────

/**
 * Partially updates the current user's Firestore profile document.
 * Invalidates the hdQuality cache on success so photo quality reflects immediately.
 */
export function useUpdateUserProfile() {
  const queryClient = useQueryClient();
  const uid = auth.currentUser?.uid ?? '';
  return useMutation<void, Error, Record<string, unknown>>({
    mutationFn: (data) => updateUserProfile(uid, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.hdQuality(uid) });
    },
  });
}

/** Fetches the company document for seat-limit and billing info. */
export function useGetCompany(companyId: string) {
  return useQuery<Company, Error>({
    queryKey: userKeys.company(companyId),
    queryFn: () => getCompany(companyId),
    enabled: !!companyId,
  });
}

/** Fetches all Sales-role users belonging to the company. */
export function useGetSalesReps(companyId: string) {
  return useQuery<SalesRep[], Error>({
    queryKey: userKeys.salesReps(companyId),
    queryFn: () => getSalesReps(companyId),
    enabled: !!companyId,
  });
}

type CreateRepVars = {
  email: string;
  firstName: string;
  lastName: string;
  companyId: string;
};

/**
 * Creates a Firebase Auth account (via secondary app) then writes the
 * Firestore profile. Invalidates the salesReps cache on success.
 */
export function useCreateRep() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, CreateRepVars>({
    mutationFn: async ({ email, firstName, lastName, companyId }) => {
      const uid = await createAuthUserSecondary(email, 'Welcome123!');
      const now = new Date().toISOString();
      const expiresAt = new Date(
        new Date().setFullYear(new Date().getFullYear() + 1),
      ).toISOString();
      await createRepProfile(uid, {
        email,
        firstName,
        lastName,
        role: 'Sales',
        companyId,
        createdAt: now,
        expiresAt,
      });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: userKeys.salesReps(vars.companyId) });
    },
  });
}
