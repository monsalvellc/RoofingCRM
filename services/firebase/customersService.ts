import {
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocFromCache,
  getDocs,
  getDocsFromCache,
  setDoc,
  updateDoc,
  query,
  where,
  type UpdateData,
  type DocumentData,
} from 'firebase/firestore';
import * as Network from 'expo-network';
import { db } from '../../config/firebaseConfig';
import { COLLECTIONS } from '../../constants/config';
import type { Customer } from '../../types/customer';
import { createAuditLog } from './auditService';
import { saveLocalEntity, getLocalEntity } from '../../utils/localVault';

type AuditActor = { id: string; name: string; companyId: string };

// ─── Token Generator ──────────────────────────────────────────────────────────

const PORTAL_TOKEN_CHARSET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const generatePortalToken = (): string =>
  Array.from({ length: 15 }, () =>
    PORTAL_TOKEN_CHARSET[Math.floor(Math.random() * PORTAL_TOKEN_CHARSET.length)],
  ).join('');

// ─── Internal Helpers ─────────────────────────────────────────────────────────

const toCustomer = (snap: { id: string; data: () => DocumentData }): Customer =>
  ({ id: snap.id, ...snap.data() } as Customer);

async function isOffline(): Promise<boolean> {
  const state = await Network.getNetworkStateAsync();
  return state.isConnected === false || state.isInternetReachable === false;
}

// ─── Read (cache-first) ───────────────────────────────────────────────────────

/**
 * Fetches a single customer by ID.
 * Tries the Firestore in-memory cache first — instant response when offline.
 */
export async function getCustomer(id: string): Promise<Customer> {
  const ref = doc(db, COLLECTIONS.customers, id);

  // 1. Firestore in-memory cache — instant when offline.
  try {
    const cached = await getDocFromCache(ref);
    if (cached.exists()) return toCustomer(cached);
  } catch (_) {
    // Not cached — fall through to network.
  }

  // 2. Network fetch.
  let snap;
  try {
    snap = await getDoc(ref);
  } catch (error) {
    // Network error — fall through to vault.
    console.warn('[customersService] getCustomer network fetch failed, checking vault:', error);
  }

  if (snap?.exists()) return toCustomer(snap);

  // 3. Local vault — covers offline-created customers not yet synced.
  const vaultCustomer = await getLocalEntity<Customer>(COLLECTIONS.customers, id);
  if (vaultCustomer) return vaultCustomer;

  // 4. Truly not found anywhere.
  console.error(`[customersService] getCustomer: "${id}" not in Firestore or vault`);
  throw new Error(`Customer with ID "${id}" was not found.`);
}

/**
 * Fetches all active customers for a company. Cache-first.
 */
export async function getAllCustomers(companyId: string): Promise<Customer[]> {
  const q = query(
    collection(db, COLLECTIONS.customers),
    where('companyId', '==', companyId),
    where('isDeleted', '==', false),
  );

  try {
    const cached = await getDocsFromCache(q);
    if (!cached.empty) return cached.docs.map(toCustomer);
  } catch (_) {
    // Cache miss — fall through.
  }

  try {
    const snap = await getDocs(q);
    return snap.docs.map(toCustomer);
  } catch (error) {
    console.error('[customersService] getAllCustomers failed:', error);
    throw new Error(`Failed to fetch customers for company "${companyId}". Please try again.`);
  }
}

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * Creates a new customer document.
 *
 * - When `id` is provided (offline-first flow from add-lead.tsx), uses `setDoc`
 *   with a fire-and-forget write so the function returns the Customer object
 *   immediately without waiting for server acknowledgement.
 * - When offline, injects `isOfflineLead: true` into the payload as a flag for
 *   downstream processing (e.g. the geocoding Cloud Function, follow-up sync).
 * - When `id` is omitted, falls back to `addDoc` (awaited) for the online path.
 *
 * @param data    Core customer fields.
 * @param creator The logged-in user, or null.
 * @param id      Optional pre-generated Firestore document ID (offline-first).
 */
export async function createCustomer(
  data: Omit<Customer, 'id'>,
  creator?: { id: string; name: string } | null,
  id?: string,
): Promise<Customer> {
  const now = new Date().toISOString();

  // 1. Generate ID locally — zero network activity.
  const newId = id ?? doc(collection(db, COLLECTIONS.customers)).id;

  const dateStr = new Date().toLocaleDateString();
  const historyEntry = creator
    ? `Customer created - ${creator.name} on ${dateStr}`
    : `Customer created on ${dateStr}`;

  let finalAssignments = data.assignedUserIds || [];
  if (creator && !finalAssignments.includes(creator.id)) {
    finalAssignments = [...finalAssignments, creator.id];
  }

  const payload: Record<string, unknown> = {
    ...data,
    assignedUserIds: finalAssignments,
    assignmentHistory: [historyEntry],
    portalToken: generatePortalToken(),
    jobIds: [],
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
  };

  // 2. True fire-and-forget — no await. Firestore writes to local cache
  //    synchronously; server sync is queued automatically.
  setDoc(doc(db, COLLECTIONS.customers, newId), payload).catch((e) =>
    console.warn('[customersService] createCustomer pending sync:', e),
  );

  // 3. Non-blocking offline handling — resolves after we've already returned.
  //    If offline: persist to the JSON vault for cross-session durability and
  //    tag the document with isOfflineLead so lists can show SyncBadge.
  isOffline().then((offline) => {
    if (offline) {
      const offlinePayload = { ...(payload as Record<string, unknown>), id: newId, isOfflineLead: true };
      // Vault write — survives app restarts.
      saveLocalEntity(COLLECTIONS.customers, offlinePayload as Record<string, unknown> & { id: string });
      // Tag the Firestore local-cache doc.
      updateDoc(doc(db, COLLECTIONS.customers, newId), { isOfflineLead: true }).catch(() => {});
    }
  });

  // 4. Non-blocking audit log.
  if (creator) {
    createAuditLog({
      companyId: data.companyId,
      entityId: newId,
      entityType: 'CUSTOMER',
      userId: creator.id,
      userName: creator.name,
      action: 'CUSTOMER_CREATED',
      message: `${creator.name} created customer ${data.firstName} ${data.lastName}`,
    });
  }

  // 5. Instant return — useMutation sees Success in ~1ms.
  return { id: newId, ...(payload as Omit<Customer, 'id'>) };
}

// ─── Update (fire-and-forget) ─────────────────────────────────────────────────

/**
 * Partially updates a customer document.
 *
 * Fire-and-forget: the Firestore write and audit log are dispatched without
 * awaiting server acknowledgement. Local cache reflects the change immediately;
 * server sync is queued automatically.
 */
export async function updateCustomer(
  id: string,
  data: Partial<Omit<Customer, 'id'>>,
  actor?: AuditActor,
  historyEntry?: string,
): Promise<void> {
  const payload: Record<string, any> = { updatedAt: new Date().toISOString() };
  for (const [key, val] of Object.entries(data as Record<string, any>)) {
    payload[key] = val === undefined ? deleteField() : val;
  }
  if (historyEntry) {
    payload.jobHistory = arrayUnion(historyEntry);
  }

  updateDoc(
    doc(db, COLLECTIONS.customers, id),
    payload as UpdateData<DocumentData>,
  ).catch((e) => console.warn('[customersService] updateCustomer pending sync:', e));

  if (actor) {
    createAuditLog({
      companyId: actor.companyId,
      entityId: id,
      entityType: 'CUSTOMER',
      userId: actor.id,
      userName: actor.name,
      action: 'CUSTOMER_UPDATED',
      message: historyEntry ?? `${actor.name} updated customer details`,
    });
  }
}

// ─── Delete (Soft, fire-and-forget) ──────────────────────────────────────────

export async function deleteCustomer(id: string, actor?: AuditActor): Promise<void> {
  updateDoc(doc(db, COLLECTIONS.customers, id), {
    isDeleted: true,
    updatedAt: new Date().toISOString(),
  }).catch((e) => console.warn('[customersService] deleteCustomer pending sync:', e));

  if (actor) {
    createAuditLog({
      companyId: actor.companyId,
      entityId: id,
      entityType: 'CUSTOMER',
      userId: actor.id,
      userName: actor.name,
      action: 'CUSTOMER_DELETED',
      message: `${actor.name} deleted customer`,
    });
  }
}

// ─── Deactivate (Hide, fire-and-forget) ───────────────────────────────────────

export async function deactivateCustomer(id: string, actor?: AuditActor): Promise<void> {
  updateDoc(doc(db, COLLECTIONS.customers, id), {
    isHidden: true,
    updatedAt: new Date().toISOString(),
  }).catch((e) => console.warn('[customersService] deactivateCustomer pending sync:', e));

  if (actor) {
    createAuditLog({
      companyId: actor.companyId,
      entityId: id,
      entityType: 'CUSTOMER',
      userId: actor.id,
      userName: actor.name,
      action: 'CUSTOMER_DEACTIVATED',
      message: `${actor.name} deactivated customer`,
    });
  }
}

// ─── Assignment ────────────────────────────────────────────────────────────────

/**
 * Updates assigned reps on a customer and fans out the same list to all
 * associated jobs. The initial customer write is fire-and-forget; the job
 * fan-out reads from cache first to minimise network usage.
 */
export async function assignCustomerReps(
  customerId: string,
  selectedUserIds: string[],
  historyEntry: string,
  actor?: AuditActor,
): Promise<void> {
  // Customer write — fire-and-forget.
  updateDoc(doc(db, COLLECTIONS.customers, customerId), {
    assignedUserIds: selectedUserIds,
    assignmentHistory: arrayUnion(historyEntry),
  }).catch((e) =>
    console.warn('[customersService] assignCustomerReps customer pending sync:', e),
  );

  // Read associated jobs (cache-first), then fan-out — fire-and-forget.
  const jobsQuery = query(
    collection(db, COLLECTIONS.jobs),
    where('customerId', '==', customerId),
  );

  let jobDocs;
  try {
    const cached = await getDocsFromCache(jobsQuery);
    jobDocs = cached.empty ? (await getDocs(jobsQuery)).docs : cached.docs;
  } catch (_) {
    try {
      jobDocs = (await getDocs(jobsQuery)).docs;
    } catch (error) {
      console.error('[customersService] assignCustomerReps job query failed:', error);
      throw new Error('Failed to save assignments. Please try again.');
    }
  }

  jobDocs.forEach((d) => {
    updateDoc(d.ref, { assignedUserIds: selectedUserIds }).catch((e) =>
      console.warn('[customersService] assignCustomerReps job pending sync:', e),
    );
  });

  if (actor) {
    createAuditLog({
      companyId: actor.companyId,
      entityId: customerId,
      entityType: 'CUSTOMER',
      userId: actor.id,
      userName: actor.name,
      action: 'CUSTOMER_ASSIGNED',
      message: historyEntry,
    });
  }
}
