// Global app state: daily usage, license/Pro status, upgrade modal control.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DAILY_LIMITS } from './config';
import { consume, getUsage, remaining } from './lib/limits';
import { getLicense } from './lib/license';
import { onStorageChange } from './lib/storage';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [usage, setUsage] = useState(null);
  const [license, setLicense] = useState({ isPro: false, key: null, expiresAt: null });
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const [u, l] = await Promise.all([getUsage(), getLicense()]);
    setUsage(u);
    setLicense(l);
    setReady(true);
  }, []);

  useEffect(() => {
    refresh();
    return onStorageChange(() => refresh());
  }, [refresh]);

  /** Try to use a feature. Pro = always allowed. Free = consumes one credit;
   *  opens the upgrade modal and returns false when exhausted. */
  const useFeature = useCallback(
    async (feature) => {
      if (license.isPro) return true;
      const updated = await consume(feature);
      if (!updated) {
        setUpgradeOpen(true);
        return false;
      }
      setUsage(updated);
      return true;
    },
    [license.isPro]
  );

  const value = useMemo(
    () => ({
      ready,
      usage,
      license,
      isPro: license.isPro,
      limits: DAILY_LIMITS,
      remainingFor: (feature) => (usage ? remaining(usage, feature) : 0),
      useFeature,
      refresh,
      upgradeOpen,
      openUpgrade: () => setUpgradeOpen(true),
      closeUpgrade: () => setUpgradeOpen(false),
    }),
    [ready, usage, license, useFeature, refresh, upgradeOpen]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
