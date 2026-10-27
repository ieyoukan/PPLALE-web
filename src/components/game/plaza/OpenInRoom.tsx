'use client';

// An old address of one of the game's screens (`/game/cards/`, a shared `/game/profile/?id=` …),
// opened from outside the game: on to the room, with the launchpad open on that screen.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLaunchpad } from './LaunchpadContext';
import { plazaHref, usePlaza } from './PlazaProvider';
import { placeOf } from './places';
import type { Section } from './places';

export function OpenInRoom({ section }: { section: Section }) {
  const { openAt } = useLaunchpad(), { id: room } = usePlaza(), router = useRouter();
  useEffect(() => {
    openAt(placeOf(new URL(window.location.href)) ?? { section }, true);
    router.replace(room ? plazaHref(room) : '/game/');
    // Once, on arriving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
