'use client';
import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n/LocaleProvider';

/** One public document subscription for a shared deck; account fields are never read. Without a name: プレイヤー in the current language. */
export function usePublicName(uid: string | undefined) {
  const [loaded, setLoaded] = useState<{ uid: string; name: string } | null>(null);
  const { t } = useI18n();
  useEffect(() => {
    if (!uid) return;
    let current = true, stop: (() => void) | undefined;
    void Promise.all([import('firebase/firestore'), import('@/lib/firebase')]).then(([sdk, { db }]) => {
      if (!current) return;
      stop = sdk.onSnapshot(sdk.doc(db, 'profiles', uid), value => {
        const name = value.data()?.displayName;
        setLoaded({ uid, name: typeof name === 'string' && name.trim() ? name : '' });
      }, () => setLoaded({ uid, name: '' }));
    }).catch(() => { if (current) setLoaded({ uid, name: '' }); });
    return () => { current = false; stop?.(); };
  }, [uid]);
  return loaded && loaded.uid === uid && loaded.name ? loaded.name : t('プレイヤー');
}
