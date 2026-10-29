'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

type ThemeMode = 'light' | 'dark' | 'system';

type DarkModeContextType = {
  isDarkMode: boolean;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleDarkMode: () => void;
};

const DarkModeContext = createContext<DarkModeContextType | undefined>(undefined);

const THEME_MODE_KEY = 'themeMode';
const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

function resolveIsDarkMode(mode: ThemeMode): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  if (typeof window === 'undefined') return false;
  return window.matchMedia(DARK_MEDIA_QUERY).matches;
}

function applyDarkClass(isDarkMode: boolean): void {
  document.documentElement.classList.toggle('dark', isDarkMode);
}

export default function DarkModeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [restored, setRestored] = useState(false);

  // The site owns its theme. Returning to the game or landing page restores their fixed palette.
  useEffect(() => () => applyDarkClass(false), []);

  useEffect(() => {
    const storedMode = localStorage.getItem(THEME_MODE_KEY);
    setRestored(true);
    if (storedMode === 'light' || storedMode === 'dark' || storedMode === 'system') {
      setThemeMode(storedMode);
      return;
    }

    // デフォルトはsystem
    setThemeMode('system');
  }, []);

  useEffect(() => {
    if (!restored) return;
    const mediaQuery = window.matchMedia(DARK_MEDIA_QUERY);

    const sync = () => {
      // トップページでは強制的にライトモード
      const isTopPage = pathname === '/';
      const nextIsDarkMode = isTopPage ? false : resolveIsDarkMode(themeMode);
      setIsDarkMode(nextIsDarkMode);
      applyDarkClass(nextIsDarkMode);
    };

    sync();
    localStorage.setItem(THEME_MODE_KEY, themeMode);

    const onSystemThemeChange = () => {
      if (themeMode === 'system') {
        sync();
      }
    };

    mediaQuery.addEventListener('change', onSystemThemeChange);
    return () => {
      mediaQuery.removeEventListener('change', onSystemThemeChange);
    };
  }, [themeMode, pathname, restored]);

  const toggleDarkMode = () => {
    setThemeMode(prev => (resolveIsDarkMode(prev) ? 'light' : 'dark'));
  };

  return (
    <DarkModeContext.Provider value={{ isDarkMode, themeMode, setThemeMode, toggleDarkMode }}>
      {children}
    </DarkModeContext.Provider>
  );
}

export function useDarkMode() {
  const context = useContext(DarkModeContext);
  if (context === undefined) {
    throw new Error('useDarkMode must be used within a DarkModeProvider');
  }
  return context;
}
