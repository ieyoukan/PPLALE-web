'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';

/** Auth needs only the app and auth SDK; Firestore loads when a saved deck is requested. */
function loadAuth() {
  return Promise.all([import('firebase/auth'), import('./firebaseApp')]).then(([sdk, { clientAuth }]) => ({ sdk, auth: clientAuth() }));
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType & { start: () => void }>({
  user: null,
  loading: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
  start: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState(false);
  const start = useCallback(() => setStarted(true), []);

  const signInWithGoogle = async () => {
    try {
      const { sdk, auth } = await loadAuth();
      await sdk.signInWithPopup(auth, new sdk.GoogleAuthProvider(), sdk.browserPopupRedirectResolver);
    } catch (error) {
      console.error('Googleログインに失敗しました:', error);
      throw error;
    }
  };

  const handleSignOut = async () => {
    try {
      const { sdk, auth } = await loadAuth();
      await sdk.signOut(auth);
    } catch (error) {
      console.error('ログアウトに失敗しました:', error);
      throw error;
    }
  };

  useEffect(() => {
    // Public pages do not need the SDK. Once a consumer starts auth, keep observing it
    // across navigation so account changes in another tab continue to clear private data.
    if (!started) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    void loadAuth().then(({ sdk, auth }) => {
      if (cancelled) return;
      unsubscribe = sdk.onAuthStateChanged(auth, nextUser => { setUser(nextUser); setLoading(false); });
    }).catch(error => {
      if (!cancelled) { console.error('ログイン状態を確認できませんでした:', error); setLoading(false); }
    });
    return () => { cancelled = true; unsubscribe?.(); };
  }, [started]);

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut: handleSignOut, start }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  const { start } = context;
  useEffect(() => { start(); }, [start]);
  return context;
}
