'use client';
import { useEffect, useState } from 'react';
import { readProfile } from '@/lib/game/social';
import type { PlayerProfile } from '@/lib/game/social';

/** Read once per page: a room's members only need their card icons. */
const cache = new Map<string, Promise<PlayerProfile | null>>();
const profile = (uid: string) => {
  let found = cache.get(uid);
  if (!found) {
    cache.set(uid, found = readProfile(uid).catch(() => null));
    if (cache.size > 200) cache.delete(cache.keys().next().value!);
  }
  return found;
};

/** The public profiles of these signed-in members (those not read yet are missing). */
export function useProfiles(ids: (string | undefined)[]) {
  const key = [...new Set(ids.filter((id): id is string => !!id))].sort().join(',');
  const [profiles, setProfiles] = useState<Record<string, PlayerProfile>>({});
  useEffect(() => {
    let current = true;
    void Promise.all(key.split(',').filter(Boolean).map(async uid => [uid, await profile(uid)] as const)).then(found => {
      if (current) setProfiles(Object.fromEntries(found.filter((entry): entry is readonly [string, PlayerProfile] => !!entry[1])));
    });
    return () => { current = false; };
  }, [key]);
  return profiles;
}

/** Guests get one of these cards, the same for the same member. */
const GUEST_ICONS = ['p_1', 'p_2', 'p_3', 'p_4', 'p_5', 'p_0'];
export const guestIcon = (member: string) => GUEST_ICONS[Array.from(member).reduce((sum, char) => sum + char.charCodeAt(0), 0) % GUEST_ICONS.length];
