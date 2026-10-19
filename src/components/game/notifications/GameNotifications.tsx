'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { NotificationSound } from '@/lib/game/notificationSound';
import type { GameNotice } from '@/lib/game/notificationSound';
import styles from './GameNotifications.module.css';

const SOUND_KEY = 'pplale-notification-sound-v1';
const SEEN_KEY = 'pplale-notification-seen-v1';
const Context = createContext<{ enabled: boolean; toggle: () => void; notify: (kind: GameNotice, id: string) => void }>({ enabled: true, toggle: () => {}, notify: () => {} });

/** Persists across menu/board navigation; session deduplication also covers reconnects and reloads. */
export function GameNotifications({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(true);
  const enabledRef = useRef(true);
  const sound = useRef<NotificationSound | null>(null);
  const seen = useRef(new Set<string>());
  const loaded = useRef(false);
  const load = useCallback(() => {
    if (loaded.current) return;
    loaded.current = true;
    try {
      enabledRef.current = localStorage.getItem(SOUND_KEY) !== 'off';
      setEnabled(enabledRef.current);
      const previous: unknown = JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? '[]');
      if (Array.isArray(previous)) seen.current = new Set(previous.filter((key): key is string => typeof key === 'string').slice(-64));
    } catch { /* Private browsing/storage restrictions still allow sounds for this visit. */ }
  }, []);
  useEffect(() => {
    load();
    const unlock = () => {
      if (!enabledRef.current) return;
      sound.current ??= new NotificationSound();
      sound.current.unlock();
    };
    const sync = (event: StorageEvent) => {
      if (event.key !== SOUND_KEY) return;
      enabledRef.current = event.newValue !== 'off';
      setEnabled(enabledRef.current);
      if (!enabledRef.current) sound.current?.mute();
    };
    window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
    window.addEventListener('keydown', unlock, { capture: true });
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      window.removeEventListener('storage', sync);
      sound.current?.close(); sound.current = null;
    };
  }, [load]);
  const notify = useCallback((kind: GameNotice, id: string) => {
    load();
    const key = `${kind}:${id}`;
    if (seen.current.has(key)) return;
    seen.current.add(key);
    if (seen.current.size > 64) seen.current.delete(seen.current.values().next().value!);
    try { sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen.current])); } catch {}
    if (enabledRef.current) sound.current?.play(kind);
  }, [load]);
  const toggle = useCallback(() => {
    enabledRef.current = !enabledRef.current;
    setEnabled(enabledRef.current);
    try { localStorage.setItem(SOUND_KEY, enabledRef.current ? 'on' : 'off'); } catch {}
    if (enabledRef.current) {
      sound.current ??= new NotificationSound();
      sound.current.unlock();
    } else sound.current?.mute();
  }, []);
  const value = useMemo(() => ({ enabled, toggle, notify }), [enabled, toggle, notify]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useGameNotifications = () => useContext(Context);

export function NotificationSoundToggle({ compact = false }: { compact?: boolean }) {
  const { enabled, toggle } = useGameNotifications();
  return <button type="button" className={`${styles.toggle} ${compact ? styles.compact : ''}`} aria-label="通知音" aria-pressed={enabled}
    title={enabled ? '通知音をOFFにする' : '通知音をONにする'} onClick={toggle}>
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4z" />
      {enabled ? <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /> : <path d="m16 9 6 6m0-6-6 6" />}
    </svg>{!compact && <span>通知音 {enabled ? 'ON' : 'OFF'}</span>}
  </button>;
}
