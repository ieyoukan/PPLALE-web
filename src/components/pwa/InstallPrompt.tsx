'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { canPromptInstall, isIos, isStandalone, promptInstall, subscribeInstall } from '@/lib/pwa';
import styles from './InstallPrompt.module.css';

const DISMISSED_KEY = 'pplale-install-dismissed-v1';
/** After × the card stays away this long. */
const QUIET_DAYS = 14;

type Way = 'prompt' | 'ios' | null;

/**
 * Recommends adding the game to the home screen, on touch screens that are not already running it as
 * the app: a one-tap button where the browser offers installing, the share-menu steps on iPhone/iPad.
 */
export function InstallPrompt() {
  const prompt = useSyncExternalStore(subscribeInstall, canPromptInstall, () => false);
  const [eligible, setEligible] = useState<'ios' | 'other' | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const dismissed = Number(localStorage.getItem(DISMISSED_KEY) || 0);
    if (isStandalone() || !window.matchMedia('(pointer: coarse)').matches || Date.now() - dismissed < QUIET_DAYS * 86_400_000) return;
    const decide = window.setTimeout(() => setEligible(isIos() ? 'ios' : 'other'), 0);
    // Slides in a moment after the page, not over its first paint.
    const timer = window.setTimeout(() => setShown(true), 1200);
    return () => { window.clearTimeout(decide); window.clearTimeout(timer); };
  }, []);

  const way: Way = eligible === 'ios' ? 'ios' : eligible === 'other' && prompt ? 'prompt' : null;
  if (!way || !shown) return null;
  const dismiss = () => { localStorage.setItem(DISMISSED_KEY, String(Date.now())); setShown(false); };
  const iphone = way === 'ios' && /iPhone|iPod/.test(navigator.userAgent);

  return <aside className={styles.card} aria-label="ホーム画面に追加">
    <Image className={styles.icon} src="/icon-192.png" alt="" width={56} height={56} />
    <div className={styles.text}>
      <strong>ホーム画面に追加</strong>
      <small>全画面で遊べて、通知も届く</small>
    </div>
    {way === 'prompt'
      ? <button className={styles.add} onClick={() => { void promptInstall(); }}>追加する</button>
      : <ol className={styles.steps}>
        <li><ShareIcon /><span className={styles.visuallyHidden}>共有</span></li>
        <li aria-hidden="true" className={styles.then}>›</li>
        <li><PlusIcon /><span>ホーム画面に追加</span></li>
      </ol>}
    <button className={styles.close} onClick={dismiss} aria-label="閉じる">×</button>
    {/* Safari's share button is in the bottom bar on iPhone. */}
    {iphone && <span className={styles.pointer} aria-hidden="true" />}
  </aside>;
}

function ShareIcon() {
  return <svg className={styles.glyph} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M8 7l4-4 4 4M7 10H5v11h14V10h-2" /></svg>;
}
function PlusIcon() {
  return <svg className={styles.glyph} viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M12 8v8M8 12h8" /></svg>;
}
