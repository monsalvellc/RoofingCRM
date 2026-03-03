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
import type { Customer } from '../../types/customer';

// ─── Internal Helper ──────────────────────────────────────────────────────────

/**
 * Maps a raw Firestore document snapshot to a strictly-typed Customer.
 * The document ID is injected as `id` since Firestore stores it separately.
 */
const toCustomer = (snap: { id: string; data: () => DocumentData }): Customer =>
  ({ id: snap.id, ...snap.data() } as Customer);

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Fetches a single customer by document ID.
 * @throws If the document does not exist or the Firestore call fails.
 */
export async function getCustomer(id: string): Promise<Customer> {
  let snap;
  try {
    snap = await getDoc(doc(db, COLLECTIONS.customers, id));
  } catch (error) {
    console.error('[customersService] getCustomer failed:', error);
    throw new Error(`Failed to fetch customer "${id}". Please try again.`);
  }

  if (!snap.exists()) {
    throw new Error(`Customer with ID "${id}" was not found.`);
  }

  return toCustomer(snap);
}

/**
 * Fetches all active (non-deleted) customers belonging to a company.
 * @throws If the Firestore query fails.
 */
export async function getAllCustomers(companyId: string): Promise<Customer[]> {
  try {
    const q = query(
      collection(db, COLLECTIONS.customers),
      where('companyId', '==', companyId),
      where('isDeleted', '==', false),
    );
    const snap = await getDocs(q);
    return snap.docs.map(toCustomer);
  } catch (error) {
    console.error('[customersService] getAllCustomers failed:', error);
    throw new Error(`Failed to fetch customers for company "${companyId}". Please try again.`);
  }
}

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * Creates a new customer document. Firestore auto-generates the document ID.
 * Returns the full Customer object including the generated ID.
 * @throws If the Firestore write fails.
 */
export async function createCustomer(data: Omit<Customer, 'id'>): Promise<Customer> {
  try {
    const ref = await addDoc(collection(db, COLLECTIONS.customers), data);
    return { id: ref.id, ...data };
  } catch (error) {
    console.error('[customersService] createCustomer failed:', error);
    throw new Error('Failed to create customer. Please try again.');
  }
}

// ─── Update ───────────────────────────────────────────────────────────────────

/**
 * Performs a partial update on an existing customer document.
 * Only the fields provided in `data` are modified; all others remain unchanged.
 * @throws If the document does not exist or the Firestore write fails.
 */
export async function updateCustomer(
  id: string,
  data: Partial<Omit<Customer, 'id'>>,
): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.customers, id), data as UpdateData<DocumentData>);
  } catch (error) {
    console.error('[customersService] updateCustomer failed:', error);
    throw new Error(`Failed to update customer "${id}". Please try again.`);
  }
}

// ─── Delete (Soft) ────────────────────────────────────────────────────────────

/**
 * Soft-deletes a customer by setting `isDeleted: true` and stamping `updatedAt`.
 * The document is retained in Firestore for audit/recovery purposes.
 * @throws If the Firestore write fails.
 */
export async function deleteCustomer(id: string): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.customers, id), {
      isDeleted: true,
      updatedAt: Date.now(),
    });
  } catch (error) {
    console.error('[customersService] deleteCustomer failed:', error);
    throw new Error(`Failed to delete customer "${id}". Please try again.`);
  }
}

// ─── Assignment ────────────────────────────────────────────────────────────────

/**
 * Updates the customer's assigned reps and appends a history entry, then syncs
 * the same `assignedUserIds` array onto every associated job document.
 * @throws If the customer update or job sync fails.
 */
export async function assignCustomerReps(
  customerId: string,
  selectedUserIds: string[],
  historyEntry: string,
): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.customers, customerId), {
      assignedUserIds: selectedUserIds,
      assignmentHistory: arrayUnion(historyEntry),
    });
    const jobsSnap = await getDocs(
      query(collection(db, COLLECTIONS.jobs), where('customerId', '==', customerId)),
    );
    await Promise.all(
      jobsSnap.docs.map((d) => updateDoc(d.ref, { assignedUserIds: selectedUserIds })),
    );
  } catch (error) {
    console.error('[customersService] assignCustomerReps failed:', error);
    throw new Error('Failed to save assignments. Please try again.');
  }
}
