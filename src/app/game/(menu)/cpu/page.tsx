import { Suspense } from 'react';
import type { Metadata } from 'next';
import { OpenInRoom } from '@/components/game/launchpad/OpenInRoom';

export const metadata: Metadata = {
    title: 'ぷぷりえーる CPU対決',
    description: 'デッキとCPUの強さを選んで、ぷぷりえーるの対戦を始める。CPU同士の観戦もできる。',
    alternates: { canonical: '/game/cpu/' },
};

/** Opens in the launchpad, over the room (places.ts). */
export default function Page() { return <Suspense><OpenInRoom section="cpu" /></Suspense>; }
