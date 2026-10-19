'use client';
import { useEffect, useState } from 'react';

/** One public document subscription for a shared deck; account fields are never read. */
export function usePublicName(uid: string | undefined) {
  const [loaded, setLoaded] = useState<{ uid: string; name: string } | null>(null);
  useEffect(() => {
    if (!uid) return;
    let current = true, stop: (() => void) | undefined;
    void Promise.all([import('firebase/firestore'), import('@/lib/firebase')]).then(([sdk, { db }]) => {
      if (!current) return;
      stop = sdk.onSnapshot(sdk.doc(db, 'profiles', uid), value => {
        const name = value.data()?.displayName;
        setLoaded({ uid, name: typeof name === 'string' && name.trim() ? name : 'プレイヤー' });
      }, () => setLoaded({ uid, name: 'プレイヤー' }));
    }).catch(() => { if (current) setLoaded({ uid, name: 'プレイヤー' }); });
    return () => { current = false; stop?.(); };
  }, [uid]);
  return loaded?.uid === uid ? loaded?.name ?? 'プレイヤー' : 'プレイヤー';
}
