// ─── App Identity ─────────────────────────────────────────────────────────────
export const APP_NAME = 'RoofPro CRM';
export const APP_VERSION = '1.0.0';

// ─── Job Status Options ───────────────────────────────────────────────────────
export const JOB_STATUSES = [
  'Lead',
  'Retail',
  'Inspected',
  'Claim Filed',
  'Met with Adjuster',
  'Partial Approval',
  'Full Approval',
  'Production',
  'Pending Payment',
  'Delinquent Payment',
  'Completed',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

// ─── Job Types ────────────────────────────────────────────────────────────────
export const JOB_TYPES = ['Retail', 'Insurance'] as const;

export type JobType = (typeof JOB_TYPES)[number];

// ─── User Roles ───────────────────────────────────────────────────────────────
export const USER_ROLES = ['SuperAdmin', 'CompanyAdmin', 'User'] as const;

export type UserRole = (typeof USER_ROLES)[number];

// ─── Lead Sources ─────────────────────────────────────────────────────────────
export const LEAD_SOURCES = [
  'Door Knock',
  'Referral',
  'Social Media',
  'Google',
  'Yard Sign',
  'Storm Chaser',
  'Repeat Customer',
  'Other',
] as const;

// ─── Trade Types ──────────────────────────────────────────────────────────────
export const TRADE_TYPES = [
  'Roofing',
  'Gutters',
  'Siding',
  'Windows',
  'Paint',
  'Interior',
  'Other',
] as const;

// ─── File Upload Limits ───────────────────────────────────────────────────────
export const UPLOAD = {
  maxPhotosPerBatch: 10,
  defaultImageQuality: 0.75,
  hdImageQuality: 1.0,
} as const;

// ─── Firebase Collection Names ────────────────────────────────────────────────
export const COLLECTIONS = {
  jobs: 'jobs',
  customers: 'customers',
  users: 'users',
  companies: 'companies',
} as const;
