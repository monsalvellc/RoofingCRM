import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../../config/firebaseConfig';
import { Typography } from '../ui';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '../../constants/theme';
import type { AuditLog, EntityType } from '../../types/audit';

// ─── Constants ────────────────────────────────────────────────────────────────

const AUDIT_COLLECTION = 'audit_logs';
const RESULT_LIMIT = 20;

// Maps action strings to dot accent colors for the timeline.
const ACTION_COLOR: Record<string, string> = {
  STATUS_UPDATED: '#7b1fa2',
  JOB_DETAILS_UPDATED: COLORS.primary,
  CONTRACT_UPDATED: COLORS.warning,
  DEPOSIT_UPDATED: COLORS.warning,
  PAYMENT_ADDED: '#0288d1',
  CUSTOMER_ASSIGNED: COLORS.secondary,
  CUSTOMER_UNASSIGNED: COLORS.danger,
};

const DEFAULT_DOT_COLOR = COLORS.textDisabled;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveTimestamp(ts: AuditLog['createdAt']): Date | null {
  if (!ts) return null;
  if (typeof ts === 'number') return new Date(ts);
  // Firestore Timestamp object
  if (typeof (ts as Timestamp).toDate === 'function') return (ts as Timestamp).toDate();
  return null;
}

function formatTimestamp(ts: AuditLog['createdAt']): string {
  const date = resolveTimestamp(ts);
  if (!date) return '—';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TimelineItem({ log, isLast }: { log: AuditLog; isLast: boolean }) {
  const dotColor = ACTION_COLOR[log.action] ?? DEFAULT_DOT_COLOR;

  return (
    <View style={styles.row}>
      {/* Left rail: dot + vertical line */}
      <View style={styles.rail}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        {!isLast && <View style={styles.line} />}
      </View>

      {/* Content */}
      <View style={[styles.content, isLast && styles.contentLast]}>
        <Typography style={styles.message}>{log.message}</Typography>
        <View style={styles.meta}>
          <Typography style={styles.userName}>{log.userName}</Typography>
          <Typography style={styles.separator}>·</Typography>
          <Typography style={styles.timestamp}>{formatTimestamp(log.createdAt)}</Typography>
        </View>

        {/* Optional field-level change pill */}
        {log.changes && (
          <View style={styles.changePill}>
            <Typography style={styles.changeText}>
              {log.changes.field}:{' '}
              <Typography style={styles.changeOld}>
                {String(log.changes.oldValue ?? '—')}
              </Typography>
              {' → '}
              <Typography style={styles.changeNew}>
                {String(log.changes.newValue ?? '—')}
              </Typography>
            </Typography>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ActiveHistoryListProps {
  entityId: string;
  entityType: EntityType;
  companyId: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ActiveHistoryList({ entityId, entityType, companyId }: ActiveHistoryListProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!entityId || !companyId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const q = query(
      collection(db, AUDIT_COLLECTION),
      where('companyId', '==', companyId),
      where('entityId', '==', entityId),
      orderBy('createdAt', 'desc'),
      limit(RESULT_LIMIT),
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const entries: AuditLog[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<AuditLog, 'id'>),
        }));
        setLogs(entries);
        setIsLoading(false);
      },
      (error) => {
        console.error('[ActiveHistoryList] onSnapshot error:', error);
        setIsLoading(false);
      },
    );

    return () => unsubscribe();
  }, [entityId, companyId]);

  // ─── Loading ──────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="small" color={COLORS.primary} />
      </View>
    );
  }

  // ─── Empty ────────────────────────────────────────────────────────────────

  if (logs.length === 0) {
    return (
      <View style={styles.centered}>
        <Typography style={styles.emptyText}>No history found for this item.</Typography>
      </View>
    );
  }

  // ─── List ─────────────────────────────────────────────────────────────────

  return (
    <FlatList
      data={logs}
      keyExtractor={(item) => item.id ?? item.createdAt.toString()}
      renderItem={({ item, index }) => (
        <TimelineItem log={item} isLast={index === logs.length - 1} />
      )}
      scrollEnabled={false}
      contentContainerStyle={styles.list}
    />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const DOT_SIZE = 10;
const RAIL_WIDTH = 20;

const styles = StyleSheet.create({
  centered: {
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textDisabled,
    fontStyle: 'italic',
  },

  list: {
    paddingTop: SPACING.xs,
  },

  // Timeline row
  row: {
    flexDirection: 'row',
  },

  // Left rail
  rail: {
    width: RAIL_WIDTH,
    alignItems: 'center',
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    marginTop: 4,
    zIndex: 1,
  },
  line: {
    flex: 1,
    width: 2,
    backgroundColor: COLORS.border,
    marginTop: 2,
    marginBottom: 0,
  },

  // Content
  content: {
    flex: 1,
    paddingLeft: SPACING.sm,
    paddingBottom: SPACING.lg,
  },
  contentLast: {
    paddingBottom: SPACING.xs,
  },
  message: {
    fontSize: FONT_SIZE.base,
    color: COLORS.textPrimary,
    fontWeight: FONT_WEIGHT.medium,
    lineHeight: FONT_SIZE.base * 1.4,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: 3,
    flexWrap: 'wrap',
  },
  userName: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHT.semibold,
  },
  separator: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textDisabled,
  },
  timestamp: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
  },

  // Change pill
  changePill: {
    alignSelf: 'flex-start',
    marginTop: SPACING.xs,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
  },
  changeText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  changeOld: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.danger,
    textDecorationLine: 'line-through',
  },
  changeNew: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHT.semibold,
  },
});
