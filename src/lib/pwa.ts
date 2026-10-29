'use client';

// Service Worker・インストール案内・アプリとしての起動状態をブラウザで管理する。

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach(listener => listener());

/** Registers the service worker and keeps the install prompt (Android, desktop Chrome) for later. Once per page. */
export function setUpPwa() {
  if (typeof window === 'undefined' || (window as { __pplalePwa?: boolean }).__pplalePwa) return;
  (window as { __pplalePwa?: boolean }).__pplalePwa = true;
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferred = event as InstallPrompt; changed(); });
  window.addEventListener('appinstalled', () => { deferred = null; changed(); });
  if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {});
}

export function subscribeInstall(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
/** True when the browser can install the app with one button (it sent beforeinstallprompt). */
export const canPromptInstall = () => !!deferred;

/** Shows the browser's own install dialog. */
export async function promptInstall() {
  const prompt = deferred;
  if (!prompt) return false;
  deferred = null;
  changed();
  await prompt.prompt();
  return (await prompt.userChoice).outcome === 'accepted';
}

/** Running as the installed app (from the home screen). */
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

/** iPhone / iPad: installed from the share menu, there is no install prompt. iPadOS reports a Mac with touch. */
export const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
