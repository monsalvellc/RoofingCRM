import type { Timestamp } from 'firebase/firestore';

export type EntityType = 'CUSTOMER' | 'JOB' | 'DOCUMENT' | 'FINANCE';

export interface AuditLogChange {
  field: string;
  oldValue: string | number | boolean | null;
  newValue: string | number | boolean | null;
}

export interface AuditLog {
  id?: string;
  companyId: string;
  entityId: string;
  entityType: EntityType;
  userId: string;
  userName: string;
  action: string;
  message: string;
  changes?: AuditLogChange;
  createdAt: number | Timestamp;
}
