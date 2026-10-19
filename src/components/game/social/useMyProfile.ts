'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { readProfile } from '@/lib/game/social';
import type { PlayerProfile } from '@/lib/game/social';
export function useMyProfileState(enabled = true) {
  const { user } = useAuth();
  const uid = enabled ? user?.uid : undefined;
  const [loaded, setLoaded] = useState<{ uid: string; profile: PlayerProfile | null } | null>(null);
  useEffect(() => {
    if (!uid) return;
    let current = true;
    const load = () => { void readProfile(uid).then(profile => { if (current) setLoaded({ uid, profile }); }, () => { if (current) setLoaded({ uid, profile: null }); }); };
    load(); window.addEventListener('pplale-profile-updated', load);
    return () => { current = false; window.removeEventListener('pplale-profile-updated', load); };
  }, [uid]);
  return { profile: loaded && loaded.uid === uid ? loaded.profile : null, loading: !!uid && loaded?.uid !== uid };
}

export function useMyProfile(enabled = true) { return useMyProfileState(enabled).profile; }
