'use client';

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { NotificationSound } from '@/lib/game/notificationSound';
import type { GameNotice } from '@/lib/game/notificationSound';
import styles from './GameNotifications.module.css';

const SOUND_KEY = 'pplale-notification-sound-v1';
const VOLUME_KEY = 'pplale-notification-volume-v1';
const readVolume = (value: string | null) => value !== null && Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : 1;
const SEEN_KEY = 'pplale-notification-seen-v1';
const Context = createContext<{ enabled: boolean; volume: number; setVolume: (volume: number) => void; preview: () => void; toggle: () => void; notify: (kind: GameNotice, id: string) => void }>({ enabled: true, volume: 1, setVolume: () => {}, preview: () => {}, toggle: () => {}, notify: () => {} });

/** Persists across menu/board navigation; session deduplication also covers reconnects and reloads. */
export function GameNotifications({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(true);
  const [volume, setVolumeState] = useState(1);
  const volumeRef = useRef(1);
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
      volumeRef.current = readVolume(localStorage.getItem(VOLUME_KEY));
      setVolumeState(volumeRef.current);
      const previous: unknown = JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? '[]');
      if (Array.isArray(previous)) seen.current = new Set(previous.filter((key): key is string => typeof key === 'string').slice(-64));
    } catch { /* Private browsing/storage restrictions still allow sounds for this visit. */ }
  }, []);
  useEffect(() => {
    load();
    const unlock = () => {
      if (!enabledRef.current) return;
      sound.current ??= new NotificationSound();
      sound.current.setVolume(volumeRef.current);
      sound.current.unlock();
    };
    const sync = (event: StorageEvent) => {
      if (event.key === VOLUME_KEY) {
        volumeRef.current = readVolume(event.newValue);
        setVolumeState(volumeRef.current);
        if (enabledRef.current) sound.current?.setVolume(volumeRef.current);
        return;
      }
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
      sound.current.setVolume(volumeRef.current);
      sound.current.unlock();
    } else sound.current?.mute();
  }, []);
  const setVolume = useCallback((next: number) => {
    volumeRef.current = Math.max(0, Math.min(1, next));
    setVolumeState(volumeRef.current);
    try { localStorage.setItem(VOLUME_KEY, String(volumeRef.current)); } catch {}
    if (enabledRef.current) sound.current?.setVolume(volumeRef.current);
  }, []);
  const preview = useCallback(() => {
    if (!enabledRef.current) return;
    sound.current ??= new NotificationSound();
    sound.current.setVolume(volumeRef.current);
    sound.current.unlock();
    sound.current.play('matched');
  }, []);
  const value = useMemo(() => ({ enabled, volume, setVolume, preview, toggle, notify }), [enabled, volume, setVolume, preview, toggle, notify]);
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

/** The game's current audio is the short match notifications; the slider adjusts their shared output. */
export function NotificationVolumeControl() {
  const { enabled, volume, setVolume, preview } = useGameNotifications();
  const id = useId();
  return <section className={styles.volume} aria-label="通知音の音量">
    <div className={styles.volumeHeading}><h3 data-ui-title>通知音</h3><NotificationSoundToggle compact /></div>
    <label htmlFor={id}>音量 <output htmlFor={id}>{Math.round(volume * 100)}%</output></label>
    <input id={id} type="range" min="0" max="100" value={Math.round(volume * 100)} onChange={event => setVolume(Number(event.target.value) / 100)} aria-label="通知音の音量" aria-valuetext={`${Math.round(volume * 100)}%`} />
    <button className={styles.toggle} disabled={!enabled || volume === 0} onClick={preview}>音をたしかめる</button>
  </section>;
}
