'use client';

// `/game/`: opening the game. Back to the room this browser is in, or into a new one, behind the
// launch screen; the address then becomes that room's own link.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LaunchScreen } from './LaunchScreen';
import { plazaHref, usePlaza } from './PlazaProvider';
import { Refused } from './RoomPage';

export function Launcher() {
  const { launch, stage } = usePlaza(), router = useRouter();
  useEffect(() => { void launch().then(id => { if (id) router.replace(plazaHref(id)); }); }, [launch, router]);
  if (stage.kind === 'refused') return <LaunchScreen><Refused reason={stage.reason} message={stage.message} /></LaunchScreen>;
  return <LaunchScreen />;
}
