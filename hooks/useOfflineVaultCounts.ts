/**
 * useOfflineVaultCounts — reads the JSON entity vault to determine how many
 * customers and jobs are pending sync.
 *
 * Used by add-lead.tsx to enforce the 3-lead offline creation limit.
 * The limit only applies when the device is offline — online creation goes
 * directly to Firestore and is never blocked.
 */

import { useCallback, useEffect, useState } from 'react';
import { getLocalEntities } from '../utils/localVault';
import { COLLECTIONS } from '../constants/config';

type NetworkModule = {
  getNetworkStateAsync: () => Promise<{ isConnected: boolean | null }>;
};
const Network = require('expo-network') as NetworkModule;

/** Maximum number of pending customers (or jobs) allowed while offline. */
export const OFFLINE_ENTITY_LIMIT = 3;

export function useOfflineVaultCounts() {
  const [customerCount, setCustomerCount] = useState(0);
  const [jobCount, setJobCount] = useState(0);
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  const refresh = useCallback(async () => {
    const [networkState, customers, jobs] = await Promise.all([
      Network.getNetworkStateAsync(),
      getLocalEntities(COLLECTIONS.customers),
      getLocalEntities(COLLECTIONS.jobs),
    ]);

    setIsOfflineMode(!networkState.isConnected);
    setCustomerCount(customers.length);
    setJobCount(jobs.length);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Only block when actually offline AND either queue is full.
  const isAtLimit =
    isOfflineMode &&
    (customerCount >= OFFLINE_ENTITY_LIMIT || jobCount >= OFFLINE_ENTITY_LIMIT);

  return {
    customerCount,
    jobCount,
    isOfflineMode,
    isAtLimit,
    OFFLINE_ENTITY_LIMIT,
    refresh,
  };
}
