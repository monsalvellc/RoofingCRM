import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import { COLLECTIONS } from '../constants/config';
import { useAuth } from '../context/AuthContext';
import type { Company } from '../types/user';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UseCompanyResult {
  currentCompany: Company | null;
  isLoadingCompany: boolean;
  error: Error | null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCompany(): UseCompanyResult {
  // isLoading covers the window where Firebase Auth has not yet resolved the
  // session — during this time companyId is '' but that is not a true "no company"
  // state, so we must not prematurely mark loading as done.
  const { userProfile, isLoading: isAuthLoading } = useAuth();
  const companyId = userProfile?.companyId ?? '';

  const [currentCompany, setCurrentCompany] = useState<Company | null>(null);
  const [isLoadingCompany, setIsLoadingCompany] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Auth is still resolving — stay in loading state, do not subscribe yet.
    if (isAuthLoading) {
      setIsLoadingCompany(true);
      return;
    }

    // Auth resolved but no profile (logged-out or profile missing).
    if (!companyId) {
      setCurrentCompany(null);
      setIsLoadingCompany(false);
      return;
    }

    setIsLoadingCompany(true);
    setError(null);

    const unsubscribe = onSnapshot(
      doc(db, COLLECTIONS.companies, companyId),
      (snap) => {
        if (snap.exists()) {
          setCurrentCompany({ id: snap.id, ...(snap.data() as Omit<Company, 'id'>) });
        } else {
          setCurrentCompany(null);
        }
        setIsLoadingCompany(false);
      },
      (err) => {
        console.error('[useCompany] onSnapshot error:', err);
        setError(err);
        setIsLoadingCompany(false);
      },
    );

    return () => unsubscribe();
  }, [companyId, isAuthLoading]);

  return { currentCompany, isLoadingCompany, error };
}
