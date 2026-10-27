import { Suspense } from 'react';
import type { Metadata } from 'next';
import { OpenInRoom } from '@/components/game/launchpad/OpenInRoom';

export const metadata: Metadata = {
    title: 'ぷぷりえーる バトル',
    description: 'フリーマッチで対戦相手を探したり、ルームマッチに友だちを招待したりして、ぷぷりえーるで対戦しよう。',
    alternates: { canonical: '/game/battle/' },
};

/** Opens in the launchpad, over the room (places.ts). */
export default function Page() { return <Suspense><OpenInRoom section="battle" /></Suspense>; }
