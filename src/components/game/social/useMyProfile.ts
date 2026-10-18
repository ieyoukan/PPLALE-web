'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { readProfile } from '@/lib/game/social';
import type { PlayerProfile } from '@/lib/game/social';
export function useMyProfile() {
  const { user } = useAuth();
  const uid = user?.uid;
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  useEffect(() => {
    if (!uid) return;
    let current = true;
    const load = () => { void readProfile(uid).then(value => { if (current) setProfile(value); }, () => {}); };
    load(); window.addEventListener('pplale-profile-updated', load);
    return () => { current = false; window.removeEventListener('pplale-profile-updated', load); };
  }, [uid]);
  return profile?.uid === uid ? profile : null;
}
