import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@prefs:showTopThreeJobs';

interface PreferencesContextValue {
  showTopThreeJobs: boolean;
  toggleShowTopThreeJobs: () => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [showTopThreeJobs, setShowTopThreeJobs] = useState(true);

  // Load persisted value on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored !== null) {
        setShowTopThreeJobs(stored === 'true');
      }
    });
  }, []);

  const toggleShowTopThreeJobs = () => {
    setShowTopThreeJobs((prev) => {
      const next = !prev;
      AsyncStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  return (
    <PreferencesContext.Provider value={{ showTopThreeJobs, toggleShowTopThreeJobs }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used inside PreferencesProvider');
  return ctx;
}
