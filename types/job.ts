export interface CostEntry {
  id: string;
  amount: number;
  note: string;
  dateAdded: number;
}

export interface MoneyRecord {
  id: string;
  amount: number;
  date: string;
  note?: string;
  receiptUrl?: string;
}

export interface LeadFile {
  id: string;
  url: string;
  name: string;
  type: 'image' | 'pdf';
  category: string;
  isPublic: boolean;
  createdAt: number;
  companyId: string;
  uploadedByUserId?: string;
}

export interface JobFile {
  id: string;
  url: string;
  name?: string; // filename — populated for documents, optional for photos
  type: 'inspection' | 'install' | 'document';
  isSharedWithCustomer: boolean;
  createdAt: string;
}

export interface JobMedia {
  id: string;
  url: string;
  category: 'inspection' | 'install';
  shared: boolean;
  uploadedAt: string;
}

export interface Job {
  // 1. Core / System
  id: string;
  customerId: string;
  companyId: string;
  jobId: string;
  assignedUserIds: string[];
  portalToken: string;
  status:
    | 'Lead'
    | 'Retail'
    | 'Inspected'
    | 'Claim Filed'
    | 'Met with Adjuster'
    | 'Partial Approval'
    | 'Full Approval'
    | 'Production'
    | 'Pending Payment'
    | 'Delinquent Payment'
    | 'Completed';
  createdAt: number | string;
  updatedAt: number | string;
  isDeleted: boolean;

  // 2. Job Details
  customerName?: string;
  customerPhone?: string;
  jobName?: string;
  jobDescription?: string;
  measurements?: string;
  jobType: 'Retail' | 'Insurance';
  jobNotes?: string;
  trades: string[];

  // 3. Financials
  contractAmount: number;
  depositAmount: number;
  isDepositPaid: boolean;
  payments: number[];
  balance: number;

  // 4. Insurance (optional)
  carrier?: string;
  claimNumber?: string;
  deductible?: number;
  adjusterName?: string;
  adjusterPhone?: string;
  adjusterEmail?: string;
  dateOfLoss?: string;
  dateOfDiscovery?: string;

  // 5. Production
  completedAt?: string | null;
  installDate?: string;
  dateOrdered?: string;
  deliveryDate?: string;
  materialOrdered?: boolean;
  materialOrderedDate?: number | null;
  expectedDeliveryDate?: number | null;

  // 6. Material Costs
  supplyStore?: string;
  originalOrderDetails?: string;
  originalOrderReceiptUrl?: string;
  mainMaterialCost: number;
  additionalSpent: MoneyRecord[];
  returnedMaterialCredit: number;
  materialCosts?: CostEntry[];
  materialReturnedTotal?: number;

  // 7. Labor Costs
  installersCost: number;
  guttersCost: number;
  contractorCosts?: CostEntry[];

  // 8. Files
  files: LeadFile[] | JobFile[];
  folderPermissions: Record<string, boolean>;

  // 9. Photos (structured media)
  inspectionPhotos?: JobMedia[];
  installPhotos?: JobMedia[];
}
