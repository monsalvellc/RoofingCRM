export interface Customer {
  id: string;
  companyId: string;
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  address: string;
  alternateAddress?: string;
  leadSource?: string;
  notes?: string;
  location?: { lat: number; lng: number };
  createdAt: number;
  updatedAt: number;
  isDeleted: boolean;
  assignedUserIds?: string[];
  assignmentHistory?: string[];
}
