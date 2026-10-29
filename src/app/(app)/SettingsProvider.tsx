'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { parseBooleanFromStorage } from '@/lib/storage';

interface SettingsContextType {
  showSettings: boolean;
  setShowSettings: (value: boolean) => void;
  isTwoCardLimit: boolean;
  setIsTwoCardLimit: (value: boolean) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [showSettings, setShowSettings] = useState(false);
  const [isTwoCardLimit, setIsTwoCardLimit] = useState(true);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    const savedTwoCardLimit = localStorage.getItem('isTwoCardLimit');
    setIsTwoCardLimit(parseBooleanFromStorage(savedTwoCardLimit, true));
    setRestored(true);
  }, []);

  useEffect(() => {
    if (restored) localStorage.setItem('isTwoCardLimit', JSON.stringify(isTwoCardLimit));
  }, [isTwoCardLimit, restored]);

  return (
    <SettingsContext.Provider value={{
      showSettings,
      setShowSettings,
      isTwoCardLimit,
      setIsTwoCardLimit
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
