import {
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
  type UpdateData,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../../config/firebaseConfig';
import { COLLECTIONS } from '../../constants/config';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompanyUser {
  id: string;
  name: string;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Fetches all users belonging to a company.
 * Returns a list of { id, name } objects suitable for assignment UI.
 * @throws If the Firestore query fails.
 */
export async function getCompanyUsers(companyId: string): Promise<CompanyUser[]> {
  try {
    const q = query(
      collection(db, COLLECTIONS.users),
      where('companyId', '==', companyId),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      id: d.id,
      name: `${d.data().firstName || ''} ${d.data().lastName || ''}`.trim(),
    }));
  } catch (error) {
    console.error('[usersService] getCompanyUsers failed:', error);
    throw new Error('Failed to fetch company users. Please try again.');
  }
}

// ─── Update ───────────────────────────────────────────────────────────────────

/**
 * Performs a partial update on a user's Firestore profile document.
 * Only the fields provided in `data` are modified; all others remain unchanged.
 * @throws If the Firestore write fails.
 */
export async function updateUserProfile(
  uid: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.users, uid), data as UpdateData<DocumentData>);
  } catch (error) {
    console.error('[usersService] updateUserProfile failed:', error);
    throw new Error('Failed to update profile. Please try again.');
  }
}
