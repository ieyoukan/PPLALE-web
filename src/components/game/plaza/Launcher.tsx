'use client';

// `/game/`: opening the game. Back to the room this browser is in, or into a new one, behind the
// launch screen; the address then becomes that room's own link.
import { useEffect, useState } from 'react';
import type { RoomInfo, RoomRules } from '@pplale/game-core/room';
import { currentPlaza, readRoomInfo } from '@/lib/game/room/client';
import { readRoomSettings } from '@/lib/game/plazaSettings';
import { useRouter } from 'next/navigation';
import { LaunchScreen } from './LaunchScreen';
import { plazaHref, usePlaza } from './PlazaProvider';
import { Refused } from './RoomPage';

export function Launcher() {
  const { launch, stage, view } = usePlaza(), router = useRouter();
  const [preview, setPreview] = useState<RoomInfo | null>(null);
  const [home, setHome] = useState(false), [rules, setRules] = useState<RoomRules>();
  useEffect(() => {
    let active = true;
    const saved = currentPlaza();
    setHome(!saved); setRules(readRoomSettings().rules);
    if (saved) void readRoomInfo(saved.id, saved.invite).then(info => { if (active) setPreview(info); }, () => { if (active) setHome(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => { void launch().then(id => { if (id) router.replace(plazaHref(id)); }); }, [launch, router]);
  if (stage.kind === 'refused') return <LaunchScreen><Refused reason={stage.reason} message={stage.message} /></LaunchScreen>;
  return <LaunchScreen home={home} homeRules={rules} preview={view ?? preview} />;
}
