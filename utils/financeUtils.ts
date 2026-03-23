/**
 * financeUtils.ts — Math and data-aggregation utility for the ERP finance engine.
 *
 * Two primary consumers:
 *   1. SuperAdmin dashboard  → `calculateCompanyFinances`
 *   2. Gamified Sales dashboard → `calculateRepEarnings`
 *
 * `FinanceJob` is intentionally a structural subset of the real `Job` type from
 * `types/job.ts`. Any `Job[]` array can be passed directly because `Job` satisfies
 * every field declared here. Keeping the interface separate means this utility
 * is also unit-testable without importing Firestore-coupled types.
 */

import type { CostEntry, MoneyRecord } from '../types/job';

// ─── Payroll Configuration Types ─────────────────────────────────────────────

export type PayFrequency = 'Weekly' | 'Bi-Weekly' | 'Monthly';

export type PayType = 'W2' | 'CommissionOnly' | 'BasePlusCommission';

export interface CompensationPlan {
  payType: PayType;
  payFrequency: PayFrequency;
  /** Fixed base salary (W2) or guaranteed draw (BasePlusCommission). 0 for CommissionOnly. */
  baseSalaryOrDraw: number;
  /** Commission percentage applied to gross profit (0–100). */
  commissionPercent: number;
  /** Flat tax withholding percentage applied to gross pay (0–100). */
  taxDeductionPercent: number;
}

// ─── Finance-Scoped Job Interface ─────────────────────────────────────────────
// Structurally compatible with `Job` from `types/job.ts` — pass Job[] directly.

export interface FinanceJob {
  id: string;
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
  /** Array of individual payment amounts received from the customer. */
  payments: number[];
  /** Pre-computed outstanding balance (contractAmount − sum of payments). */
  balance: number;
  /** Primary material purchase total. */
  mainMaterialCost: number;
  /** Line-item additional material purchases. */
  additionalSpent: MoneyRecord[];
  /** Optional structured material cost entries (ERP cost-tracking). */
  materialCosts?: CostEntry[];
  /** Total value of materials returned / credited — optional, falls back to returnedMaterialCredit. */
  materialReturnedTotal?: number;
  /** Legacy returned-material credit field, always present on Job. */
  returnedMaterialCredit: number;
  /** Labour cost for roofing installer crew. */
  installersCost: number;
  /** Labour cost for gutter installation. */
  guttersCost: number;
  /** Optional structured contractor cost entries (ERP cost-tracking). */
  contractorCosts?: CostEntry[];
  /** IDs of the sales reps assigned to this job. */
  assignedUserIds: string[];
  /** ISO-8601 date string set when the job reached 'Completed' status. Null if incomplete. */
  completedAt?: string | null;
}

// ─── Result Types ─────────────────────────────────────────────────────────────

export interface CompanyFinancesResult {
  /** Sum of all payments collected across every job. */
  totalRevenue: number;
  /** Net material spend after returns/credits. Always ≥ 0. */
  totalMaterialCosts: number;
  /** Sum of all contractor and labour costs. */
  totalContractorCosts: number;
  /** totalRevenue − totalMaterialCosts − totalContractorCosts. Can be negative. */
  totalGrossProfit: number;
  /**
   * Sum of outstanding balances on jobs that are 'Completed' AND whose
   * completedAt timestamp is more than 5 days in the past.
   */
  delinquentTotal: number;
}

export interface RepEarningsResult extends CompanyFinancesResult {
  /** Number of jobs in the input set with status === 'Completed'. */
  jobsCompleted: number;
  /** Commission earned: totalGrossProfit × (commissionPercent / 100). */
  expectedCommission: number;
  /**
   * Gross pay before tax:
   *  - CommissionOnly        → expectedCommission
   *  - W2 / BasePlusCommission → baseSalaryOrDraw + expectedCommission
   */
  expectedGrossPay: number;
  /** expectedGrossPay after applying taxDeductionPercent. */
  expectedNetPay: number;
  /** The compensation plan used for this calculation, or undefined if none was provided. */
  compPlan: CompensationPlan | undefined;
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

const MS_PER_DAY = 1_000 * 60 * 60 * 24;
const DELINQUENT_THRESHOLD_DAYS = 5;

/** Sum a number array safely — treats NaN / non-finite values as 0. */
function safeSum(values: number[]): number {
  return values.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);
}

/** Total net material cost for a single job after returns. Always ≥ 0. */
function jobMaterialCost(job: FinanceJob): number {
  const costEntries = safeSum((job.materialCosts ?? []).map((c) => c.amount));
  const additionalEntries = safeSum((job.additionalSpent ?? []).map((r) => r.amount));
  const mainCost = Number.isFinite(job.mainMaterialCost) ? job.mainMaterialCost : 0;

  const gross = mainCost + additionalEntries + costEntries;

  // Prefer the explicit materialReturnedTotal field; fall back to returnedMaterialCredit.
  const returned = Number.isFinite(job.materialReturnedTotal)
    ? (job.materialReturnedTotal as number)
    : Number.isFinite(job.returnedMaterialCredit)
      ? job.returnedMaterialCredit
      : 0;

  // Credits cannot flip costs negative — clamp to zero.
  return Math.max(0, gross - returned);
}

/** Total contractor + labour cost for a single job. */
function jobContractorCost(job: FinanceJob): number {
  const costEntries = safeSum((job.contractorCosts ?? []).map((c) => c.amount));
  const installers = Number.isFinite(job.installersCost) ? job.installersCost : 0;
  const gutters = Number.isFinite(job.guttersCost) ? job.guttersCost : 0;
  return installers + gutters + costEntries;
}

/** Returns true if the job was completed more than `DELINQUENT_THRESHOLD_DAYS` ago. */
function isOverdueCompleted(job: FinanceJob, now: number): boolean {
  if (job.status !== 'Completed') return false;
  if (!job.completedAt) return false;

  const completedMs = new Date(job.completedAt).getTime();
  if (!Number.isFinite(completedMs)) return false;

  return now - completedMs > DELINQUENT_THRESHOLD_DAYS * MS_PER_DAY;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Aggregates financial metrics across a set of jobs.
 * Powers the SuperAdmin / company-wide analytics dashboard.
 *
 * @param jobs  Array of jobs to aggregate. Empty array returns all-zero result.
 */
export function calculateCompanyFinances(jobs: FinanceJob[]): CompanyFinancesResult {
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return {
      totalRevenue: 0,
      totalMaterialCosts: 0,
      totalContractorCosts: 0,
      totalGrossProfit: 0,
      delinquentTotal: 0,
    };
  }

  const now = Date.now();

  let totalRevenue = 0;
  let totalMaterialCosts = 0;
  let totalContractorCosts = 0;
  let delinquentTotal = 0;

  for (const job of jobs) {
    // Collected revenue = sum of all payments received.
    totalRevenue += safeSum(job.payments ?? []);

    totalMaterialCosts += jobMaterialCost(job);
    totalContractorCosts += jobContractorCost(job);

    // Delinquent: completed more than 5 days ago with an outstanding balance.
    if (isOverdueCompleted(job, now)) {
      const outstanding = Number.isFinite(job.balance) ? job.balance : 0;
      if (outstanding > 0) {
        delinquentTotal += outstanding;
      }
    }
  }

  const totalGrossProfit = totalRevenue - totalMaterialCosts - totalContractorCosts;

  return {
    totalRevenue: round2(totalRevenue),
    totalMaterialCosts: round2(totalMaterialCosts),
    totalContractorCosts: round2(totalContractorCosts),
    totalGrossProfit: round2(totalGrossProfit),
    delinquentTotal: round2(delinquentTotal),
  };
}

/**
 * Calculates a sales rep's earnings for a given job set and compensation plan.
 * Powers the gamified Sales dashboard — call this with jobs pre-filtered to
 * only include jobs where `assignedUserIds` contains the rep's UID.
 *
 * @param jobs      Rep-scoped jobs array (pre-filtered by caller).
 * @param compPlan  The rep's compensation plan. When undefined, all pay fields return 0.
 */
export function calculateRepEarnings(
  jobs: FinanceJob[],
  compPlan?: CompensationPlan,
): RepEarningsResult {
  const finances = calculateCompanyFinances(jobs);

  const jobsCompleted = Array.isArray(jobs)
    ? jobs.filter((j) => j.status === 'Completed').length
    : 0;

  // No compensation plan — return base finances with zero pay metrics.
  if (!compPlan) {
    return {
      ...finances,
      jobsCompleted,
      expectedCommission: 0,
      expectedGrossPay: 0,
      expectedNetPay: 0,
      compPlan: undefined,
    };
  }

  // Clamp percentages to [0, 100] so malformed data can't produce nonsense pay.
  const commissionRate = Math.min(100, Math.max(0, compPlan.commissionPercent)) / 100;
  const taxRate = Math.min(100, Math.max(0, compPlan.taxDeductionPercent)) / 100;
  const base = Number.isFinite(compPlan.baseSalaryOrDraw) ? compPlan.baseSalaryOrDraw : 0;

  const expectedCommission = finances.totalGrossProfit * commissionRate;

  let expectedGrossPay: number;
  switch (compPlan.payType) {
    case 'CommissionOnly':
      expectedGrossPay = expectedCommission;
      break;
    case 'W2':
    case 'BasePlusCommission':
      expectedGrossPay = base + expectedCommission;
      break;
    default:
      // Exhaustive guard — TypeScript will warn if a new PayType is added without handling it.
      expectedGrossPay = expectedCommission;
  }

  const expectedNetPay = expectedGrossPay - expectedGrossPay * taxRate;

  return {
    ...finances,
    jobsCompleted,
    expectedCommission: round2(expectedCommission),
    expectedGrossPay: round2(expectedGrossPay),
    expectedNetPay: round2(expectedNetPay),
    compPlan,
  };
}

// ─── Private Formatting Helper ────────────────────────────────────────────────

/** Round to 2 decimal places to avoid floating-point drift in currency values. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
