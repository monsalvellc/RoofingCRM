import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebaseConfig';
import type { AuditLog } from '../../types/audit';

const AUDIT_COLLECTION = 'audit_logs';

/**
 * Writes a structured audit log entry to the top-level `audit_logs` collection.
 * Failures are caught and logged to the console without propagating — audit
 * logging must never break the main UI flow.
 */
export async function createAuditLog(
  logData: Omit<AuditLog, 'id' | 'createdAt'>,
): Promise<void> {
  try {
    await addDoc(collection(db, AUDIT_COLLECTION), {
      ...logData,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('[auditService] Failed to write audit log:', error);
  }
}
