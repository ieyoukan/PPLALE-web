import { Suspense } from 'react';
import type { Metadata } from 'next';
import { OpenInRoom } from '@/components/game/launchpad/OpenInRoom';

export const metadata: Metadata = {
    title: 'ぷぷりえーる ルーム',
    description: 'ルームを探して、フレンドとの対戦や観戦を楽しもう。',
    alternates: { canonical: '/game/battle/' },
};

/** Opens in the launchpad, over the room (places.ts). */
export default function Page() { return <Suspense><OpenInRoom section="discover" /></Suspense>; }
