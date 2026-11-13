import { browserLocalPersistence, browserSessionPersistence, connectAuthEmulator, getAuth, indexedDBLocalPersistence, initializeAuth, type Auth } from 'firebase/auth';
import { initializeApp, getApps, getApp } from 'firebase/app';

const firebaseConfig = {
  apiKey: "AIzaSyBTXnTZ7ZG5oYi2dE69Dls8bM6CVOlJAyA",
  authDomain: "pplale-6cca0.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === 'true' ? 'demo-pplale-social' : "pplale-6cca0",
  storageBucket: "pplale-6cca0.firebasestorage.app",
  messagingSenderId: "606126303449",
  appId: "1:606126303449:web:67b8123a477e0f54faf6c8",
  measurementId: "G-SZPZ5GN71F"
};

/** The web app's public API key (not a secret), also used by the server to check ID tokens. */
export const firebaseApiKey = firebaseConfig.apiKey;

// Firebaseの初期化（既存のアプリがある場合はそれを使用）
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Explicit local integration environment; production never enables these endpoints.
/**
 * getAuth() also installs the popup resolver, which loads firebaseapp.com's auth iframe (~93 KiB) on every page load.
 * Auth starts without it; sign-in passes browserPopupRedirectResolver only when the popup opens.
 */
export function clientAuth(): Auth {
  if (typeof window === 'undefined') return getAuth(app);
  const globals = globalThis as typeof globalThis & { pplaleAuth?: Auth };
  return globals.pplaleAuth ??= initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence] });
}

if (process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === 'true') {
  const auth = clientAuth();
  const globals = globalThis as typeof globalThis & { pplaleEmulatedAuth?: WeakSet<object> };
  globals.pplaleEmulatedAuth ??= new WeakSet();
  if (!globals.pplaleEmulatedAuth.has(auth)) { connectAuthEmulator(auth, 'http://127.0.0.1:19099', { disableWarnings: true }); globals.pplaleEmulatedAuth.add(auth); }
}
