import { Suspense } from 'react';
import type { Metadata } from 'next';
import { OpenInRoom } from '@/components/game/launchpad/OpenInRoom';

export const metadata: Metadata = {
    title: 'ぷぷりえーる カード図鑑',
    description: 'ぷぷりえーるの幼女・お菓子・プレイアブル・トークンのカード一覧。',
    alternates: { canonical: '/game/cards/zukan/' },
};

/** Opens in the launchpad, over the room (places.ts). */
export default function Page() { return <Suspense><OpenInRoom section="zukan" /></Suspense>; }
