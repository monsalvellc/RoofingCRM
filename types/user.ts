export interface Company {
  id: string;
  name: string;
  maxSeats: number;
  activeSeats: number;
  createdAt: number;
}

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  companyId: string;
  role: 'SuperAdmin' | 'CompanyAdmin' | 'User';
  tags: string[];
  isActive: boolean;
  createdAt: number;
  /** Feature-flag: admin can enable the HD toggle for this user. */
  allowHdToggle?: boolean;
  /** User preference: upload photos at full resolution when true. */
  hdPhotosEnabled?: boolean;
}
