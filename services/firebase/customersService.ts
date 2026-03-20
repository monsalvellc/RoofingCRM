import {
  arrayUnion,
  collection,
  deleteField,
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
import { createAuditLog } from './auditService';

// Actor shape passed by callers who have auth context available.
// All actor params are optional — audit logging silently skips if omitted.
type AuditActor = { id: string; name: string; companyId: string };

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
 * Automatically stamps timestamps, sets isDeleted, assigns the creator, and
 * writes an initial assignment history entry.
 * @param data    Core customer fields (createdAt/updatedAt/isDeleted are overwritten internally).
 * @param creator The logged-in user creating the record, or null if unavailable.
 * @throws If the Firestore write fails.
 */
// export async function createCustomer(
//   data: Omit<Customer, 'id'>,
//   creator?: { id: string; name: string } | null,
// ): Promise<Customer> {
//   try {
//     const now = new Date().toISOString();
//     const dateLabel = new Date().toLocaleDateString('en-US', {
//       month: 'short',
//       day: 'numeric',
//       year: 'numeric',
//     });

//     const historyEntry = creator
//       ? `Customer created - ${creator.name} on ${dateLabel}`
//       : `Customer created on ${dateLabel}`;

//     const assignedUserIds = [...(data.assignedUserIds ?? [])];
//     if (creator?.id && !assignedUserIds.includes(creator.id)) {
//       assignedUserIds.push(creator.id);
//     }

//     const payload: Omit<Customer, 'id'> = {
//       ...data,
//       assignedUserIds,
//       assignmentHistory: [historyEntry],
//       isDeleted: false,
//       createdAt: now,
//       updatedAt: now,
//     };

//     const ref = await addDoc(collection(db, COLLECTIONS.customers), payload);
//     return { id: ref.id, ...payload };
//   } catch (error) {
//     console.error('[customersService] createCustomer failed:', error);
//     throw new Error('Failed to create customer. Please try again.');
//   }
// }

export async function createCustomer(
  data: Omit<Customer, 'id'>, 
  creator?: { id: string; name: string } | null
): Promise<Customer> {
  try {
    const now = new Date().toISOString();
    
    // 1. Generate the History Log
    const dateStr = new Date().toLocaleDateString();
    const historyEntry = creator 
      ? `Customer created - ${creator.name} on ${dateStr}`
      : `Customer created on ${dateStr}`;

    // 2. Ensure the Creator is Assigned (if not already)
    let finalAssignments = data.assignedUserIds || [];
    if (creator && !finalAssignments.includes(creator.id)) {
      finalAssignments = [...finalAssignments, creator.id];
    }

    // 3. Build the Robust Payload
    const payload = {
      ...data,
      assignedUserIds: finalAssignments,
      assignmentHistory: [historyEntry], // <--- Starts the log!
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    };

    const ref = await addDoc(collection(db, COLLECTIONS.customers), payload);
    if (creator) {
      await createAuditLog({
        companyId: data.companyId,
        entityId: ref.id,
        entityType: 'CUSTOMER',
        userId: creator.id,
        userName: creator.name,
        action: 'CUSTOMER_CREATED',
        message: `${creator.name} created customer ${data.firstName} ${data.lastName}`,
      });
    }
    return { id: ref.id, ...payload };
  } catch (error) {
    console.error('[customersService] createCustomer failed:', error);
    throw new Error('Failed to create customer. Please try again.');
  }
}

// ─── Update ───────────────────────────────────────────────────────────────────

/**
 * Performs a partial update on an existing customer document.
 * Always stamps `updatedAt`. When `historyEntry` is supplied it is appended to
 * the customer's `jobHistory` array via arrayUnion (so the Job History card on
 * the customer profile reflects the change without a separate write). When
 * `actor` is supplied an audit_log document is written as well.
 *
 * Only the fields provided in `data` are modified; all others are untouched.
 * @throws If the Firestore write fails.
 */
export async function updateCustomer(
  id: string,
  data: Partial<Omit<Customer, 'id'>>,
  actor?: AuditActor,
  historyEntry?: string,
): Promise<void> {
  try {
    // Build the Firestore payload. We cast to `any` here because arrayUnion
    // returns a FieldValue which is not assignable to the typed Customer fields
    // — Firestore accepts it at runtime and the cast keeps TypeScript happy.
    // Build payload manually so any undefined optional fields become deleteField()
    // instead of being passed as-is — Firestore rejects raw undefined values.
    const payload: Record<string, any> = { updatedAt: new Date().toISOString() };
    for (const [key, val] of Object.entries(data as Record<string, any>)) {
      payload[key] = val === undefined ? deleteField() : val;
    }

    // Append the history string to the jobHistory array on the customer doc.
    // arrayUnion is idempotent — duplicates are ignored automatically.
    if (historyEntry) {
      payload.jobHistory = arrayUnion(historyEntry);
    }

    await updateDoc(doc(db, COLLECTIONS.customers, id), payload as UpdateData<DocumentData>);

    // Write a structured audit log entry if the caller provided actor context.
    if (actor) {
      await createAuditLog({
        companyId: actor.companyId,
        entityId: id,
        entityType: 'CUSTOMER',
        userId: actor.id,
        userName: actor.name,
        action: 'CUSTOMER_UPDATED',
        message: historyEntry ?? `${actor.name} updated customer details`,
      });
    }
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
export async function deleteCustomer(id: string, actor?: AuditActor): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.customers, id), {
      isDeleted: true,
      updatedAt: new Date().toISOString(),
    });
    if (actor) {
      await createAuditLog({
        companyId: actor.companyId,
        entityId: id,
        entityType: 'CUSTOMER',
        userId: actor.id,
        userName: actor.name,
        action: 'CUSTOMER_DELETED',
        message: `${actor.name} deleted customer`,
      });
    }
  } catch (error) {
    console.error('[customersService] deleteCustomer failed:', error);
    throw new Error(`Failed to delete customer "${id}". Please try again.`);
  }
}

// ─── Deactivate (Hide) ────────────────────────────────────────────────────────

/**
 * Hides a customer (and all their associated jobs) from the pipeline by setting
 * `isHidden: true`. The records are NOT deleted — they remain in Firestore and
 * can be restored by setting `isHidden: false` directly in the console.
 * @throws If the Firestore write fails.
 */
export async function deactivateCustomer(id: string, actor?: AuditActor): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.customers, id), {
      isHidden: true,
      updatedAt: new Date().toISOString(),
    });
    if (actor) {
      await createAuditLog({
        companyId: actor.companyId,
        entityId: id,
        entityType: 'CUSTOMER',
        userId: actor.id,
        userName: actor.name,
        action: 'CUSTOMER_DEACTIVATED',
        message: `${actor.name} deactivated customer`,
      });
    }
  } catch (error) {
    console.error('[customersService] deactivateCustomer failed:', error);
    throw new Error(`Failed to deactivate customer "${id}". Please try again.`);
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
  actor?: AuditActor,
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
    if (actor) {
      await createAuditLog({
        companyId: actor.companyId,
        entityId: customerId,
        entityType: 'CUSTOMER',
        userId: actor.id,
        userName: actor.name,
        action: 'CUSTOMER_ASSIGNED',
        message: historyEntry,
      });
    }
  } catch (error) {
    console.error('[customersService] assignCustomerReps failed:', error);
    throw new Error('Failed to save assignments. Please try again.');
  }
}
