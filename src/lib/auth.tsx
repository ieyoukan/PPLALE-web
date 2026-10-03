'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';

/** Auth needs only the app and auth SDK; Firestore loads when a saved deck is requested. */
function loadAuth() {
  return Promise.all([import('firebase/auth'), import('./firebaseApp')]).then(([sdk, { app }]) => ({ sdk, auth: sdk.getAuth(app) }));
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const signInWithGoogle = async () => {
    try {
      const { sdk, auth } = await loadAuth();
      await sdk.signInWithPopup(auth, new sdk.GoogleAuthProvider());
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
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    void loadAuth().then(({ sdk, auth }) => {
      if (cancelled) return;
      unsubscribe = sdk.onAuthStateChanged(auth, nextUser => { setUser(nextUser); setLoading(false); });
    }).catch(error => {
      if (!cancelled) { console.error('ログイン状態を確認できませんでした:', error); setLoading(false); }
    });
    return () => { cancelled = true; unsubscribe?.(); };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut: handleSignOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
