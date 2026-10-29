'use client';

// ゲーム外から旧形式の画面URLを開いたとき、ルームへ移って指定画面をランチパッドで開く。
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLaunchpad } from './LaunchpadContext';
import { plazaHref, usePlaza } from '@/components/game/plaza/PlazaProvider';
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
