import { Suspense } from 'react';
import type { Metadata } from 'next';
import { OpenInRoom } from '@/components/game/plaza/OpenInRoom';

export const metadata: Metadata = {
    title: 'ぷぷりえーる フリーマッチ',
    description: 'デッキを選んで対戦相手を探そう。ルームIDなしで遊べるオンライン対戦。',
    alternates: { canonical: '/game/battle/free/' },
};

/** Opens in the launchpad, over the room (places.ts). */
export default function Page() { return <Suspense><OpenInRoom section="free" /></Suspense>; }
