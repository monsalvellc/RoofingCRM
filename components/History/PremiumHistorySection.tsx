import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCompany } from '../../hooks/useCompany';
import { Card, Typography } from '../ui';
import { ActiveHistoryList } from './ActiveHistoryList';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '../../constants/theme';
import type { EntityType } from '../../types/audit';

// ─── Props ────────────────────────────────────────────────────────────────────

interface PremiumHistorySectionProps {
  entityId: string;
  entityType: EntityType;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PremiumHistorySection({ entityId, entityType }: PremiumHistorySectionProps) {
  const { currentCompany } = useCompany();
  const hasAccess = currentCompany?.features?.premiumHistory === true;

  if (hasAccess) {
    return (
      <ActiveHistoryList
        entityId={entityId}
        entityType={entityType}
        companyId={currentCompany?.id ?? ''}
      />
    );
  }

  return (
    <Card elevation="sm" style={styles.card}>
      <View style={styles.iconWrapper}>
        <Ionicons name="lock-closed" size={28} color={COLORS.textDisabled} />
      </View>
      <Typography style={styles.title}>Premium History</Typography>
      <Typography style={styles.body}>
        Upgrade your company workspace to unlock a detailed audit trail of all changes.
      </Typography>
    </Card>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    paddingVertical: SPACING.xxl,
    paddingHorizontal: SPACING.xl,
    gap: SPACING.sm,
    borderStyle: 'dashed',
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  iconWrapper: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.round,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  title: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  body: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: FONT_SIZE.md * 1.5,
  },
});
