'use client';

// ゲームの起動入口。保存されたルームへ復帰するか新規作成し、そのルームのURLへ移動する。
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
