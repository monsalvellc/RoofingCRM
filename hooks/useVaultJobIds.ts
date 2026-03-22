/**
 * useVaultJobIds — returns a Set of job IDs that currently have at least one
 * image stored in the local Image Vault.
 *
 * This is the single source of truth for SyncBadge visibility on pipeline
 * cards. It intentionally ignores the `isOfflineLead` Firestore field, which
 * remains `true` on the server document after sync and would cause a
 * permanently-stuck badge.
 *
 * The set is refreshed:
 * - On mount
 * - When `refresh()` is called (e.g. after a successful sync)
 */

import { useCallback, useEffect, useState } from 'react';
import { getAllVaultJobIds } from '../utils/imageVault';

export function useVaultJobIds() {
  const [vaultJobIds, setVaultJobIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(() => {
    getAllVaultJobIds().then((ids) => setVaultJobIds(new Set(ids)));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { vaultJobIds, refresh };
}
