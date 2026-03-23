/**
 * analytics.tsx — ERP Analytics & Gamified Payroll Dashboard
 *
 * Role-based views:
 *   SuperAdmin / CompanyAdmin → Company-wide finances + rep picker (toggle to personal)
 *   Sales                    → Personal earnings, gamified paycheck card, profit breakdown
 *   Production / User        → Operational schedule and job-completion metrics
 *
 * Prerequisites:
 *   npx expo install react-native-gifted-charts react-native-svg
 */

import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BarChart, PieChart } from 'react-native-gifted-charts';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useMergedAllJobs } from '../../hooks/useMergedData';
import { useGetSalesReps } from '../../hooks/useUsers';
import {
  calculateCompanyFinances,
  calculateRepEarnings,
  type FinanceJob,
} from '../../utils/financeUtils';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '../../constants/theme';

// ─── Dark Palette (screen-local) ──────────────────────────────────────────────

const D = {
  bg: '#121212',
  card: '#1E1E1E',
  cardAlt: '#252525',
  border: '#2C2C2C',
  text: '#FFFFFF',
  textSub: '#AAAAAA',
  textMuted: '#666666',
  green: '#4CAF50',
  greenDim: '#1B5E20',
  greenBg: 'rgba(76,175,80,0.12)',
  red: '#EF5350',
  redBg: 'rgba(239,83,80,0.12)',
  orange: '#FFA726',
  blue: '#42A5F5',
  purple: '#AB47BC',
  tabActive: '#4CAF50',
  tabBg: '#2A2A2A',
} as const;

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

// ─── Date Parsing Helper ──────────────────────────────────────────────────────
// Handles all formats that Firestore + the app can produce:
// Firestore Timestamp object, toMillis(), JS Date, ISO string, Unix ms number.

function parseDateMs(val: unknown): number {
  if (!val) return 0;
  if (typeof val === 'object' && val !== null) {
    // Firestore Timestamp ({ seconds, nanoseconds })
    if ('seconds' in val) return (val as { seconds: number }).seconds * 1000;
    // Firestore Timestamp with toMillis()
    if (typeof (val as any).toMillis === 'function') return (val as any).toMillis();
    // JS Date
    if (val instanceof Date) return isNaN(val.getTime()) ? 0 : val.getTime();
  }
  if (typeof val === 'string') {
    const ms = new Date(val).getTime();
    return isNaN(ms) ? 0 : ms;
  }
  if (typeof val === 'number') return val;
  return 0;
}

// ─── Formatting Helpers ───────────────────────────────────────────────────────

function formatCurrency(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function formatCurrencyFull(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  return `${sign}$${abs.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

// ─── Shared Sub-Components ────────────────────────────────────────────────────

type FilterChipProps = {
  label: string;
  active: boolean;
  onPress: () => void;
};

function FilterChip({ label, active, onPress }: FilterChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        chipStyles.chip,
        active ? chipStyles.chipActive : chipStyles.chipIdle,
      ]}
    >
      <Text
        style={[
          chipStyles.chipText,
          active ? chipStyles.chipTextActive : chipStyles.chipTextIdle,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.round,
    marginRight: SPACING.sm,
    borderWidth: 1,
  },
  chipActive: {
    backgroundColor: D.green,
    borderColor: D.green,
  },
  chipIdle: {
    backgroundColor: 'transparent',
    borderColor: D.border,
  },
  chipText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
  },
  chipTextActive: { color: '#000' },
  chipTextIdle: { color: D.textSub },
});

// ─── Stat Card ────────────────────────────────────────────────────────────────

type StatCardProps = {
  label: string;
  value: string;
  valueColor?: string;
  subtitle?: string;
  icon?: string;
  flex?: number;
};

function StatCard({ label, value, valueColor = D.text, subtitle, icon, flex = 1 }: StatCardProps) {
  return (
    <View style={[cardStyles.card, { flex }]}>
      {icon ? (
        <Ionicons name={icon as any} size={18} color={D.textMuted} style={cardStyles.icon} />
      ) : null}
      <Text style={cardStyles.label}>{label}</Text>
      <Text style={[cardStyles.value, { color: valueColor }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {subtitle ? <Text style={cardStyles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: D.card,
    borderRadius: RADIUS.xl,
    padding: SPACING.base,
    borderWidth: 1,
    borderColor: D.border,
  },
  icon: { marginBottom: SPACING.xs },
  label: {
    fontSize: FONT_SIZE.xs,
    color: D.textMuted,
    fontWeight: FONT_WEIGHT.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: SPACING.xs,
  },
  value: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.heavy,
  },
  subtitle: {
    fontSize: FONT_SIZE.xs,
    color: D.textMuted,
    marginTop: SPACING.xs,
  },
});

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return <Text style={sectionHeaderStyle}>{title}</Text>;
}

const sectionHeaderStyle: object = {
  fontSize: FONT_SIZE.base,
  fontWeight: FONT_WEIGHT.semibold,
  color: D.textSub,
  marginBottom: SPACING.md,
  textTransform: 'uppercase',
  letterSpacing: 0.8,
};

// ─── Chart Legend Row ─────────────────────────────────────────────────────────

type LegendItemProps = { color: string; label: string; value: string };

function LegendItem({ color, label, value }: LegendItemProps) {
  return (
    <View style={legendStyles.row}>
      <View style={[legendStyles.dot, { backgroundColor: color }]} />
      <Text style={legendStyles.label}>{label}</Text>
      <Text style={legendStyles.value}>{value}</Text>
    </View>
  );
}

const legendStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: SPACING.sm,
  },
  label: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: D.textSub,
  },
  value: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: D.text,
  },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
  const { userProfile } = useAuth();
  const { width: screenWidth } = useWindowDimensions();

  const companyId = userProfile?.companyId ?? '';

  const { data: allJobs = [], isLoading: jobsLoading } = useMergedAllJobs(companyId);
  const { data: salesReps = [] } = useGetSalesReps(companyId);

  // ── State ──────────────────────────────────────────────────────────────────
  // 'ALL' = company-wide; any repId = filter to that rep.
  const [selectedRepId, setSelectedRepId] = useState<string | 'ALL'>('ALL');
  // Admin can toggle between company-wide and their own personal stats.
  const [adminView, setAdminView] = useState<'company' | 'personal'>('company');
  // Time scope — defaults to the current year, no month filter.
  const [selectedYear, setSelectedYear] = useState<number | 'ALL'>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | 'ALL'>('ALL');

  // ── Available years — derived from all jobs so the picker scales with data ──
  // Always includes the current calendar year so a fresh company sees it.
  const availableYears = useMemo(() => {
    const yearSet = new Set<number>();
    yearSet.add(new Date().getFullYear());
    for (const job of allJobs) {
      const raw = job.completedAt ?? job.createdAt;
      const ms = parseDateMs(raw);
      if (ms > 0) yearSet.add(new Date(ms).getFullYear());
    }
    return Array.from(yearSet).sort((a, b) => b - a); // newest first
  }, [allJobs]);

  // ── Master time filter — applied before any rep or role sub-filtering ───────
  // Uses completedAt (realized revenue) when present; falls back to createdAt
  // (pipeline / active jobs) so no job disappears from the view just because
  // it hasn't been closed yet.
  const timeScopedJobs = useMemo(() => {
    if (selectedYear === 'ALL' && selectedMonth === 'ALL') return allJobs;
    return allJobs.filter((job) => {
      // Prefer completedAt; null falls through to createdAt via ??
      const raw = job.completedAt ?? job.createdAt;
      if (!raw) return false; // no date at all — cannot scope; exclude when filtering
      const ms = parseDateMs(raw);
      if (ms === 0) return false;
      const d = new Date(ms);
      if (selectedYear !== 'ALL' && d.getFullYear() !== selectedYear) return false;
      if (selectedMonth !== 'ALL' && d.getMonth() !== selectedMonth) return false;
      return true;
    });
  }, [allJobs, selectedYear, selectedMonth]);

  // ── Human-readable label for the currently active scope ───────────────────
  const activeScopeLabel = useMemo(() => {
    if (selectedYear === 'ALL' && selectedMonth === 'ALL') return 'All Time';
    if (selectedYear === 'ALL') return `${MONTH_LABELS[selectedMonth as number]} — All Years`;
    if (selectedMonth === 'ALL') return String(selectedYear);
    return `${MONTH_LABELS[selectedMonth as number]} ${selectedYear}`;
  }, [selectedYear, selectedMonth]);

  // ── Role flags ─────────────────────────────────────────────────────────────
  const isAdmin = userProfile
    ? ['SuperAdmin', 'CompanyAdmin'].includes(userProfile.role)
    : false;
  const isSales = userProfile?.role === 'Sales';
  const isProduction =
    userProfile?.role === 'Production' || userProfile?.role === 'User';

  // ── Admin: company-wide (or rep-filtered) finances ─────────────────────────
  // timeScopedJobs is the gate — rep filter narrows further inside the scope.
  const adminFilteredJobs = useMemo(() => {
    if (selectedRepId === 'ALL') return timeScopedJobs;
    return timeScopedJobs.filter((j) => j.assignedUserIds?.includes(selectedRepId));
  }, [timeScopedJobs, selectedRepId]);

  const companyFinances = useMemo(
    () => calculateCompanyFinances(adminFilteredJobs as FinanceJob[]),
    [adminFilteredJobs],
  );

  // ── Personal: jobs assigned to the signed-in user ─────────────────────────
  // Scoped through timeScopedJobs so time filters apply to the Sales/Production views too.
  const myJobs = useMemo(
    () =>
      userProfile
        ? timeScopedJobs.filter((j) => j.assignedUserIds?.includes(userProfile.id))
        : [],
    [timeScopedJobs, userProfile],
  );

  const repEarnings = useMemo(
    () => calculateRepEarnings(myJobs as FinanceJob[], userProfile?.compensation),
    [myJobs, userProfile?.compensation],
  );

  // ── Production stats ───────────────────────────────────────────────────────
  const myProductionJobs = useMemo(
    () => myJobs.filter((j) => j.status === 'Production'),
    [myJobs],
  );
  const myCompletedJobs = useMemo(
    () => myJobs.filter((j) => j.status === 'Completed'),
    [myJobs],
  );

  // ── Chart sizing ───────────────────────────────────────────────────────────
  // Account for outer padding (base × 2) and inner card padding (base × 2).
  const chartWidth = screenWidth - SPACING.base * 4;

  // ── Loading guard ──────────────────────────────────────────────────────────
  if (!userProfile || jobsLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={D.green} size="large" />
        <Text style={styles.loadingText}>Loading analytics…</Text>
      </View>
    );
  }

  // ─── renderSuperAdminView ──────────────────────────────────────────────────

  const renderSuperAdminView = () => {
    const totalCosts =
      companyFinances.totalMaterialCosts + companyFinances.totalContractorCosts;
    const maxBarValue = Math.max(companyFinances.totalRevenue, totalCosts, 1);

    const barData = [
      {
        value: companyFinances.totalRevenue,
        frontColor: D.green,
        label: 'Revenue',
        topLabelComponent: () => (
          <Text style={styles.barTopLabel}>
            {formatCurrency(companyFinances.totalRevenue)}
          </Text>
        ),
      },
      {
        value: companyFinances.totalMaterialCosts,
        frontColor: D.orange,
        label: 'Materials',
        topLabelComponent: () => (
          <Text style={styles.barTopLabel}>
            {formatCurrency(companyFinances.totalMaterialCosts)}
          </Text>
        ),
      },
      {
        value: companyFinances.totalContractorCosts,
        frontColor: D.blue,
        label: 'Labour',
        topLabelComponent: () => (
          <Text style={styles.barTopLabel}>
            {formatCurrency(companyFinances.totalContractorCosts)}
          </Text>
        ),
      },
      {
        value: Math.max(0, companyFinances.totalGrossProfit),
        frontColor: companyFinances.totalGrossProfit >= 0 ? D.green : D.red,
        label: 'Profit',
        topLabelComponent: () => (
          <Text style={styles.barTopLabel}>
            {formatCurrency(companyFinances.totalGrossProfit)}
          </Text>
        ),
      },
    ];

    return (
      <View>
        {/* ── Rep picker ───────────────────────────────────────────────── */}
        <SectionHeader title="Filter by Rep" />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
          contentContainerStyle={styles.chipScrollContent}
        >
          <FilterChip
            label="Company"
            active={selectedRepId === 'ALL'}
            onPress={() => setSelectedRepId('ALL')}
          />
          {salesReps.map((rep) => (
            <FilterChip
              key={rep.id}
              label={`${rep.firstName} ${rep.lastName}`}
              active={selectedRepId === rep.id}
              onPress={() => setSelectedRepId(rep.id)}
            />
          ))}
        </ScrollView>

        {/* ── Summary cards row ─────────────────────────────────────────── */}
        <SectionHeader title="Summary" />
        <View style={styles.cardRow}>
          <StatCard
            label="Revenue"
            value={formatCurrency(companyFinances.totalRevenue)}
            valueColor={D.green}
            flex={1}
          />
          <View style={styles.cardGap} />
          <StatCard
            label="Gross Profit"
            value={formatCurrency(companyFinances.totalGrossProfit)}
            valueColor={
              companyFinances.totalGrossProfit >= 0 ? D.green : D.red
            }
            flex={1}
          />
        </View>

        <View style={[styles.cardRow, { marginTop: SPACING.sm }]}>
          <StatCard
            label="Total Costs"
            value={formatCurrency(totalCosts)}
            valueColor={D.orange}
            subtitle={`Mat: ${formatCurrency(companyFinances.totalMaterialCosts)}  ·  Lab: ${formatCurrency(companyFinances.totalContractorCosts)}`}
            flex={1}
          />
          <View style={styles.cardGap} />
          <StatCard
            label="Delinquent"
            value={formatCurrency(companyFinances.delinquentTotal)}
            valueColor={companyFinances.delinquentTotal > 0 ? D.red : D.textMuted}
            subtitle="Completed > 5 days, unpaid"
            flex={1}
          />
        </View>

        {/* ── Bar chart ─────────────────────────────────────────────────── */}
        <View style={styles.chartCard}>
          <SectionHeader title="Revenue vs Costs" />
          {companyFinances.totalRevenue === 0 && totalCosts === 0 ? (
            <View style={styles.noDataContainer}>
              <Ionicons name="bar-chart-outline" size={36} color={D.textMuted} />
              <Text style={styles.noDataText}>No financial data yet</Text>
            </View>
          ) : (
            <BarChart
              data={barData}
              width={chartWidth - SPACING.base * 2}
              height={180}
              barWidth={46}
              spacing={Math.floor((chartWidth - SPACING.base * 2 - 46 * 4) / 5)}
              noOfSections={4}
              maxValue={maxBarValue * 1.25}
              yAxisTextStyle={styles.axisLabel}
              xAxisLabelTextStyle={styles.axisLabel}
              hideRules={false}
              rulesColor={D.border}
              rulesType="solid"
              barBorderRadius={RADIUS.sm}
              backgroundColor={D.card}
              yAxisColor={D.border}
              xAxisColor={D.border}
              yAxisThickness={1}
              xAxisThickness={1}
              formatYLabel={(v) => formatCurrency(Number(v))}
            />
          )}
        </View>
      </View>
    );
  };

  // ─── renderSalesView ───────────────────────────────────────────────────────

  const renderSalesView = () => {
    const hasPlan = !!userProfile.compensation;
    const jobsCompleted = repEarnings.jobsCompleted;
    const jobsInProgress = myJobs.filter(
      (j) => j.status !== 'Completed' && j.status !== 'Lead',
    ).length;

    // Pie chart: slices of total revenue by category.
    // Only include slices with a positive value to keep gifted-charts happy.
    const rawPieData = [
      {
        value: Math.max(0, repEarnings.totalGrossProfit),
        color: D.green,
        label: 'Net Profit',
      },
      {
        value: repEarnings.totalMaterialCosts,
        color: D.orange,
        label: 'Materials',
      },
      {
        value: repEarnings.totalContractorCosts,
        color: D.blue,
        label: 'Labour',
      },
    ];
    const pieData = rawPieData.filter((d) => d.value > 0);
    const hasPieData = pieData.length > 0;

    return (
      <View>
        {/* ── Expected Paycheck hero card ──────────────────────────────── */}
        <View style={styles.paycheckCard}>
          <Text style={styles.paycheckLabel}>EXPECTED PAYCHECK</Text>
          <Text style={styles.paycheckNet} adjustsFontSizeToFit numberOfLines={1}>
            {hasPlan ? formatCurrencyFull(repEarnings.expectedNetPay) : '—'}
          </Text>
          <Text style={styles.paycheckNetLabel}>Est. Net Pay (after tax)</Text>

          <View style={styles.paycheckDivider} />

          <View style={styles.paycheckDetailRow}>
            <View style={styles.paycheckDetailItem}>
              <Text style={styles.paycheckDetailLabel}>Gross Pay</Text>
              <Text style={styles.paycheckDetailValue}>
                {hasPlan ? formatCurrencyFull(repEarnings.expectedGrossPay) : '—'}
              </Text>
            </View>
            <View style={styles.paycheckDetailItem}>
              <Text style={styles.paycheckDetailLabel}>Commission</Text>
              <Text style={styles.paycheckDetailValue}>
                {hasPlan ? formatCurrencyFull(repEarnings.expectedCommission) : '—'}
              </Text>
            </View>
          </View>

          <View style={styles.paycheckDetailRow}>
            <View style={styles.paycheckDetailItem}>
              <Text style={styles.paycheckDetailLabel}>Base / Draw</Text>
              <Text style={styles.paycheckDetailValue}>
                {hasPlan
                  ? formatCurrencyFull(userProfile.compensation!.baseSalaryOrDraw)
                  : '—'}
              </Text>
            </View>
            <View style={styles.paycheckDetailItem}>
              <Text style={styles.paycheckDetailLabel}>Tax Rate</Text>
              <Text style={styles.paycheckDetailValue}>
                {hasPlan ? `${userProfile.compensation!.taxDeductionPercent}%` : '—'}
              </Text>
            </View>
          </View>

          {hasPlan && (
            <View style={styles.paycheckBadge}>
              <Text style={styles.paycheckBadgeText}>
                {userProfile.compensation!.payType} · {userProfile.compensation!.payFrequency}
              </Text>
            </View>
          )}

          {!hasPlan && (
            <Text style={styles.noPlanNotice}>
              No compensation plan assigned yet. Contact your admin.
            </Text>
          )}
        </View>

        {/* ── Job count stats ───────────────────────────────────────────── */}
        <SectionHeader title="My Performance" />
        <View style={styles.cardRow}>
          <StatCard
            label="Completed"
            value={String(jobsCompleted)}
            valueColor={D.green}
            flex={1}
          />
          <View style={styles.cardGap} />
          <StatCard
            label="In Progress"
            value={String(jobsInProgress)}
            valueColor={D.blue}
            flex={1}
          />
          <View style={styles.cardGap} />
          <StatCard
            label="Total Jobs"
            value={String(myJobs.length)}
            valueColor={D.text}
            flex={1}
          />
        </View>

        {/* ── Generated Revenue stats ───────────────────────────────────── */}
        <View style={[styles.cardRow, { marginTop: SPACING.sm }]}>
          <StatCard
            label="Revenue Generated"
            value={formatCurrency(repEarnings.totalRevenue)}
            valueColor={D.green}
            flex={1}
          />
          <View style={styles.cardGap} />
          <StatCard
            label="Gross Profit"
            value={formatCurrency(repEarnings.totalGrossProfit)}
            valueColor={repEarnings.totalGrossProfit >= 0 ? D.green : D.red}
            flex={1}
          />
        </View>

        {/* ── Profit breakdown donut chart ──────────────────────────────── */}
        <View style={styles.chartCard}>
          <SectionHeader title="Revenue Breakdown" />
          {!hasPieData ? (
            <View style={styles.noDataContainer}>
              <Ionicons name="pie-chart-outline" size={36} color={D.textMuted} />
              <Text style={styles.noDataText}>No revenue data yet</Text>
            </View>
          ) : (
            <View style={styles.donutContainer}>
              <PieChart
                data={pieData}
                donut
                radius={90}
                innerRadius={58}
                centerLabelComponent={() => (
                  <View style={styles.donutCenter}>
                    <Text style={styles.donutCenterValue} numberOfLines={1} adjustsFontSizeToFit>
                      {formatCurrency(Math.max(0, repEarnings.totalGrossProfit))}
                    </Text>
                    <Text style={styles.donutCenterLabel}>Profit</Text>
                  </View>
                )}
                strokeColor={D.bg}
                strokeWidth={2}
              />
              <View style={styles.legendContainer}>
                {rawPieData
                  .filter((d) => d.value > 0)
                  .map((d) => (
                    <LegendItem
                      key={d.label}
                      color={d.color}
                      label={d.label}
                      value={formatCurrency(d.value)}
                    />
                  ))}
              </View>
            </View>
          )}
        </View>
      </View>
    );
  };

  // ─── renderProductionView ──────────────────────────────────────────────────

  const renderProductionView = () => {
    const comp = userProfile.compensation;
    const allAssigned = myJobs.length;
    const activeStatuses: Array<(typeof allJobs)[0]['status']> = [
      'Production',
      'Pending Payment',
      'Full Approval',
      'Partial Approval',
    ];
    const activeJobs = myJobs.filter((j) => activeStatuses.includes(j.status));

    return (
      <View>
        {/* ── Pay schedule card ─────────────────────────────────────────── */}
        <SectionHeader title="My Schedule" />
        <View style={styles.scheduleCard}>
          <View style={styles.scheduleRow}>
            <Ionicons name="calendar-outline" size={22} color={D.green} />
            <View style={styles.scheduleTextBlock}>
              <Text style={styles.scheduleLabel}>Pay Frequency</Text>
              <Text style={styles.scheduleValue}>
                {comp?.payFrequency ?? 'Not assigned'}
              </Text>
            </View>
          </View>
          <View style={styles.scheduleDivider} />
          <View style={styles.scheduleRow}>
            <Ionicons name="briefcase-outline" size={22} color={D.blue} />
            <View style={styles.scheduleTextBlock}>
              <Text style={styles.scheduleLabel}>Pay Type</Text>
              <Text style={styles.scheduleValue}>
                {comp?.payType ?? 'Not assigned'}
              </Text>
            </View>
          </View>
          {comp && (
            <>
              <View style={styles.scheduleDivider} />
              <View style={styles.scheduleRow}>
                <Ionicons name="cash-outline" size={22} color={D.orange} />
                <View style={styles.scheduleTextBlock}>
                  <Text style={styles.scheduleLabel}>Base / Draw</Text>
                  <Text style={styles.scheduleValue}>
                    {formatCurrencyFull(comp.baseSalaryOrDraw)}
                  </Text>
                </View>
              </View>
            </>
          )}
        </View>

        {/* ── Operational metrics ───────────────────────────────────────── */}
        <SectionHeader title="Job Status" />
        <View style={styles.cardRow}>
          <StatCard
            label="In Production"
            value={String(myProductionJobs.length)}
            valueColor={D.purple}
            flex={1}
          />
          <View style={styles.cardGap} />
          <StatCard
            label="Completed"
            value={String(myCompletedJobs.length)}
            valueColor={D.green}
            flex={1}
          />
        </View>

        <View style={[styles.cardRow, { marginTop: SPACING.sm }]}>
          <StatCard
            label="Active (all stages)"
            value={String(activeJobs.length)}
            valueColor={D.blue}
            subtitle="Approval · Production · Payment"
            flex={1}
          />
          <View style={styles.cardGap} />
          <StatCard
            label="Total Assigned"
            value={String(allAssigned)}
            valueColor={D.text}
            flex={1}
          />
        </View>
      </View>
    );
  };

  // ─── Layout ────────────────────────────────────────────────────────────────

  const showCompanyView = isAdmin && adminView === 'company';
  const showPersonalView = (isAdmin && adminView === 'personal') || isSales;
  const showProductionView = isProduction;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Screen header ──────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Analytics</Text>
          {(selectedYear !== 'ALL' || selectedMonth !== 'ALL') && (
            <Pressable
              style={styles.scopeBadge}
              onPress={() => { setSelectedYear('ALL'); setSelectedMonth('ALL'); }}
              hitSlop={8}
            >
              <Text style={styles.scopeBadgeText}>{activeScopeLabel}</Text>
              <Ionicons name="close-circle" size={13} color={D.green} style={{ marginLeft: 4 }} />
            </Pressable>
          )}
        </View>
        <Text style={styles.headerSub}>
          {userProfile.firstName} {userProfile.lastName} · {userProfile.role}
        </Text>
      </View>

      {/* ── Admin view switcher ────────────────────────────────────────── */}
      {isAdmin && (
        <View style={styles.viewSwitcher}>
          <Pressable
            style={[styles.switchBtn, adminView === 'company' && styles.switchBtnActive]}
            onPress={() => setAdminView('company')}
          >
            <Ionicons
              name="business-outline"
              size={15}
              color={adminView === 'company' ? '#000' : D.textSub}
              style={styles.switchIcon}
            />
            <Text
              style={[
                styles.switchBtnText,
                adminView === 'company' && styles.switchBtnTextActive,
              ]}
            >
              Company
            </Text>
          </Pressable>
          <Pressable
            style={[styles.switchBtn, adminView === 'personal' && styles.switchBtnActive]}
            onPress={() => setAdminView('personal')}
          >
            <Ionicons
              name="person-outline"
              size={15}
              color={adminView === 'personal' ? '#000' : D.textSub}
              style={styles.switchIcon}
            />
            <Text
              style={[
                styles.switchBtnText,
                adminView === 'personal' && styles.switchBtnTextActive,
              ]}
            >
              My Stats
            </Text>
          </Pressable>
        </View>
      )}

      {/* ── Time filter controls ───────────────────────────────────────── */}
      <View style={styles.timeFilterSection}>
        {/* Year row */}
        <View style={styles.timeFilterRow}>
          <Text style={styles.timeFilterLabel}>Year</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipScrollContent}
          >
            <FilterChip
              label="All"
              active={selectedYear === 'ALL'}
              onPress={() => setSelectedYear('ALL')}
            />
            {availableYears.map((y) => (
              <FilterChip
                key={String(y)}
                label={String(y)}
                active={selectedYear === y}
                onPress={() => setSelectedYear(y)}
              />
            ))}
          </ScrollView>
        </View>

        {/* Month row — disabled (greyed) when year is ALL so the interaction
            is intentional: pick a year first, then optionally narrow to a month. */}
        <View style={[styles.timeFilterRow, selectedYear === 'ALL' && styles.timeFilterRowDimmed]}>
          <Text style={styles.timeFilterLabel}>Month</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipScrollContent}
            scrollEnabled={selectedYear !== 'ALL'}
          >
            <FilterChip
              label="All"
              active={selectedMonth === 'ALL'}
              onPress={() => selectedYear !== 'ALL' && setSelectedMonth('ALL')}
            />
            {MONTH_LABELS.map((m, i) => (
              <FilterChip
                key={m}
                label={m}
                active={selectedMonth === i}
                onPress={() => selectedYear !== 'ALL' && setSelectedMonth(i)}
              />
            ))}
          </ScrollView>
        </View>
      </View>

      {/* ── Role-based content ─────────────────────────────────────────── */}
      {showCompanyView && renderSuperAdminView()}
      {showPersonalView && renderSalesView()}
      {showProductionView && renderProductionView()}

      {/* Bottom safe-area pad */}
      <View style={styles.bottomPad} />
    </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Root ──────────────────────────────────────────────────────────────────
  // safeArea fills the status-bar region with the same dark background so
  // there is no light flash before the ScrollView content begins.
  safeArea: {
    flex: 1,
    backgroundColor: D.bg,
  },
  screen: {
    flex: 1,
    backgroundColor: D.bg,
  },
  content: {
    paddingHorizontal: SPACING.base,
    paddingTop: SPACING.xl,
  },
  centered: {
    flex: 1,
    backgroundColor: D.bg,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.md,
  },
  loadingText: {
    color: D.textMuted,
    fontSize: FONT_SIZE.sm,
  },
  bottomPad: {
    height: SPACING.xxxl,
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    marginBottom: SPACING.xl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: FONT_WEIGHT.heavy,
    color: D.text,
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: FONT_SIZE.sm,
    color: D.textMuted,
    marginTop: SPACING.xs,
  },
  // Tappable scope badge in the header — tap to clear both filters at once.
  scopeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: D.greenBg,
    borderRadius: RADIUS.round,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderWidth: 1,
    borderColor: D.greenDim,
  },
  scopeBadgeText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
    color: D.green,
  },

  // ── Time filter section ───────────────────────────────────────────────────
  timeFilterSection: {
    marginBottom: SPACING.xl,
    backgroundColor: D.card,
    borderRadius: RADIUS.xl,
    paddingVertical: SPACING.md,
    borderWidth: 1,
    borderColor: D.border,
    gap: SPACING.xs,
  },
  timeFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
  },
  // Visual cue that month picker is inactive when no year is selected.
  timeFilterRowDimmed: {
    opacity: 0.38,
  },
  timeFilterLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
    color: D.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    width: 38, // fixed width keeps chips left-aligned regardless of label length
    flexShrink: 0,
  },

  // ── View switcher (admin toggle) ──────────────────────────────────────────
  viewSwitcher: {
    flexDirection: 'row',
    backgroundColor: D.tabBg,
    borderRadius: RADIUS.xl,
    padding: 3,
    marginBottom: SPACING.xl,
  },
  switchBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.lg,
  },
  switchBtnActive: {
    backgroundColor: D.green,
  },
  switchIcon: {
    marginRight: SPACING.xs,
  },
  switchBtnText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: D.textSub,
  },
  switchBtnTextActive: {
    color: '#000000',
  },

  // ── Chip scroller ─────────────────────────────────────────────────────────
  chipScroll: {
    marginBottom: SPACING.lg,
  },
  chipScrollContent: {
    paddingRight: SPACING.base,
  },

  // ── Card layout helpers ───────────────────────────────────────────────────
  cardRow: {
    flexDirection: 'row',
    marginBottom: SPACING.base,
  },
  cardGap: {
    width: SPACING.sm,
  },

  // ── Bar chart ─────────────────────────────────────────────────────────────
  chartCard: {
    backgroundColor: D.card,
    borderRadius: RADIUS.xl,
    padding: SPACING.base,
    borderWidth: 1,
    borderColor: D.border,
    marginBottom: SPACING.base,
    overflow: 'hidden',
  },
  barTopLabel: {
    fontSize: 9,
    color: D.textSub,
    marginBottom: 4,
    textAlign: 'center',
  },
  axisLabel: {
    color: D.textMuted,
    fontSize: FONT_SIZE.xs,
  },

  // ── No data placeholder ───────────────────────────────────────────────────
  noDataContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xl,
    gap: SPACING.sm,
  },
  noDataText: {
    color: D.textMuted,
    fontSize: FONT_SIZE.sm,
  },

  // ── Paycheck hero card ────────────────────────────────────────────────────
  paycheckCard: {
    backgroundColor: D.card,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
    borderWidth: 1,
    borderColor: D.greenDim,
    // Subtle green glow via shadow
    shadowColor: D.green,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  paycheckLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.heavy,
    color: D.green,
    letterSpacing: 1.5,
    marginBottom: SPACING.sm,
  },
  paycheckNet: {
    fontSize: 52,
    fontWeight: FONT_WEIGHT.heavy,
    color: D.green,
    letterSpacing: -1,
    lineHeight: 58,
  },
  paycheckNetLabel: {
    fontSize: FONT_SIZE.sm,
    color: D.textMuted,
    marginTop: SPACING.xs,
    marginBottom: SPACING.md,
  },
  paycheckDivider: {
    height: 1,
    backgroundColor: D.border,
    marginVertical: SPACING.md,
  },
  paycheckDetailRow: {
    flexDirection: 'row',
    marginBottom: SPACING.sm,
  },
  paycheckDetailItem: {
    flex: 1,
  },
  paycheckDetailLabel: {
    fontSize: FONT_SIZE.xs,
    color: D.textMuted,
    marginBottom: 2,
  },
  paycheckDetailValue: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
    color: D.text,
  },
  paycheckBadge: {
    alignSelf: 'flex-start',
    backgroundColor: D.greenBg,
    borderRadius: RADIUS.round,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    marginTop: SPACING.md,
    borderWidth: 1,
    borderColor: D.greenDim,
  },
  paycheckBadgeText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
    color: D.green,
  },
  noPlanNotice: {
    fontSize: FONT_SIZE.sm,
    color: D.textMuted,
    fontStyle: 'italic',
    marginTop: SPACING.md,
  },

  // ── Donut chart layout ────────────────────────────────────────────────────
  donutContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xl,
  },
  donutCenter: {
    alignItems: 'center',
    width: 80,
  },
  donutCenterValue: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.heavy,
    color: D.green,
  },
  donutCenterLabel: {
    fontSize: FONT_SIZE.xs,
    color: D.textMuted,
    marginTop: 2,
  },
  legendContainer: {
    flex: 1,
  },

  // ── Schedule card (Production) ─────────────────────────────────────────────
  scheduleCard: {
    backgroundColor: D.card,
    borderRadius: RADIUS.xl,
    padding: SPACING.base,
    borderWidth: 1,
    borderColor: D.border,
    marginBottom: SPACING.xl,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    gap: SPACING.md,
  },
  scheduleTextBlock: {
    flex: 1,
  },
  scheduleLabel: {
    fontSize: FONT_SIZE.xs,
    color: D.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  scheduleValue: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: D.text,
    marginTop: 2,
  },
  scheduleDivider: {
    height: 1,
    backgroundColor: D.border,
    marginLeft: 38, // align with text, not icon
  },
});
