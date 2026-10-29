'use client';

// 旧形式の共有URLを、現在のルームURLへ転送する。
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { isRoomId } from '@pplale/game-core/room';
import { HOME_PATH, roomHref } from '@/lib/game/sessionStore';

function Forward() {
  const params = useSearchParams(), router = useRouter();
  useEffect(() => {
    const id = params.get('id');
    router.replace(isRoomId(id) ? `${roomHref(id)}${params.get('watch') === '1' ? '?watch=1' : ''}` : HOME_PATH);
  }, [params, router]);
  return null;
}
export default function Page() {
  return <Suspense><Forward /></Suspense>;
}
