'use client';

import { useSyncExternalStore } from 'react';
import { useBoardContext } from '../board/BoardContext';
import styles from '../BoardEmulator.module.css';

const subscribe = (change: () => void) => {
  document.addEventListener('fullscreenchange', change);
  return () => document.removeEventListener('fullscreenchange', change);
};
/** null: the browser has no full screen for pages (iPhone), so there is no button. */
const snapshot = () => document.fullscreenEnabled ? !!document.fullscreenElement : null;

/** Full screen in one tap from the corner (on Android also held in landscape, see stageSpace). */
export function FullscreenButton() {
  const { toggleFullscreen } = useBoardContext();
  const full = useSyncExternalStore(subscribe, snapshot, () => null);
  if (full === null) return null;
  return <button className={`${styles.infoButton} ${styles.fullscreenButton}`} aria-label={full ? '全画面を終了' : '全画面'} aria-pressed={full} onClick={toggleFullscreen}>
    <svg className={styles.fullscreenIcon} viewBox="0 0 24 24" aria-hidden="true">
      {/* Corners pointing out to enlarge, pointing in to come back. */}
      <path d={full ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5' : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'} />
    </svg>
    <small>{full ? 'もどす' : '全画面'}</small>
  </button>;
}
