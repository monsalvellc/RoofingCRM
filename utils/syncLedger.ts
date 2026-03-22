/**
 * Sync Ledger — lightweight AsyncStorage map tracking how many media files
 * are pending upload for each job.
 *
 * This avoids expensive FileSystem directory scans every time the pipeline
 * renders. The ledger is the single source of truth for SyncBadge visibility:
 *   - Incremented when a file is saved to the media vault offline.
 *   - Cleared when triggerSync() completes successfully for that job.
 *
 * Shape stored in AsyncStorage:  { [jobId]: pendingCount }
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const LEDGER_KEY = '@sync_ledger_v1';

// ─── Public API ───────────────────────────────────────────────────────────────

/** Returns the full ledger map (jobId → pending file count). */
export async function getLedger(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(LEDGER_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return {};
  }
}

/**
 * Increments the pending count for `jobId` by `amount`.
 * Creates the entry if it doesn't exist yet.
 */
export async function incrementLedger(jobId: string, amount: number): Promise<void> {
  try {
    const ledger = await getLedger();
    ledger[jobId] = (ledger[jobId] ?? 0) + amount;
    await AsyncStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
  } catch (err) {
    console.warn('[syncLedger] incrementLedger failed:', err);
  }
}

/**
 * Decrements the pending count for `jobId` by `amount`.
 * Removes the entry entirely when it reaches zero or below.
 * Call this immediately after each successful file deletion during sync so
 * the ledger stays accurate even when a sync is interrupted mid-way.
 */
export async function decrementLedger(jobId: string, amount: number): Promise<void> {
  try {
    const ledger = await getLedger();
    const next = (ledger[jobId] ?? 0) - amount;
    if (next <= 0) {
      delete ledger[jobId];
    } else {
      ledger[jobId] = next;
    }
    await AsyncStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
  } catch (err) {
    console.warn('[syncLedger] decrementLedger failed:', err);
  }
}

/**
 * Removes a job from the ledger after all its files have been synced.
 * Idempotent — safe to call even if the job isn't in the ledger.
 */
export async function clearLedger(jobId: string): Promise<void> {
  try {
    const ledger = await getLedger();
    delete ledger[jobId];
    await AsyncStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
  } catch (err) {
    console.warn('[syncLedger] clearLedger failed:', err);
  }
}
