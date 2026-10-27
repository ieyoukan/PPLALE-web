import { Suspense } from 'react';
import type { Metadata } from 'next';
import { OpenInRoom } from '@/components/game/plaza/OpenInRoom';

export const metadata: Metadata = {
    title: 'ぷぷりえーる カード',
    description: 'ぷぷりえーるのカード図鑑とデッキ構築への入口。',
    alternates: { canonical: '/game/cards/' },
};

/** Opens in the launchpad, over the room (places.ts). */
export default function Page() { return <Suspense><OpenInRoom section="cards" /></Suspense>; }
