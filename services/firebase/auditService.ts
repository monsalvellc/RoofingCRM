import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebaseConfig';
import type { AuditLog } from '../../types/audit';

const AUDIT_COLLECTION = 'audit_logs';

/**
 * Writes a structured audit log entry to the top-level `audit_logs` collection.
 *
 * Fire-and-forget: the write is dispatched to the Firestore local cache
 * immediately and queued for server sync, but the caller is NOT blocked.
 * Audit logging must never freeze the UI or break the main flow.
 */
export function createAuditLog(
  logData: Omit<AuditLog, 'id' | 'createdAt'>,
): void {
  addDoc(collection(db, AUDIT_COLLECTION), {
    ...logData,
    createdAt: serverTimestamp(),
  }).catch((error) => {
    console.error('[auditService] Failed to write audit log:', error);
  });
}
