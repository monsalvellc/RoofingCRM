export interface Company {
  id: string;
  name: string;
  allowedSeats: number;
  logoUrl?: string;
  createdAt: number;
  subscriptionStatus: 'active' | 'past_due' | 'canceled' | 'trialing';
  planInterval: 'month' | 'year';
  /** Firestore Timestamp, Date, or Unix milliseconds — normalize before comparing. */
  currentPeriodEnd: number | Date | any;
}

export interface SalesRep {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  companyId: string;
  isActive?: boolean;
  createdAt?: string | number;
  expiresAt?: string | number;
}

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  companyId: string;
  role: 'SuperAdmin' | 'CompanyAdmin' | 'Sales' | 'Production' | 'User';
  tags: string[];
  isActive?: boolean;
  createdAt: number;
  /** Feature-flag: admin can enable the HD toggle for this user. */
  allowHdToggle?: boolean;
  /** User preference: upload photos at full resolution when true. */
  hdPhotosEnabled?: boolean;
}
