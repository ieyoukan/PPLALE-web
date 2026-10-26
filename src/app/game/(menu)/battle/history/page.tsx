import { Suspense } from 'react';
import type { Metadata } from 'next';
import { OpenInRoom } from '@/components/game/plaza/OpenInRoom';

export const metadata: Metadata = { title: 'ぷぷりえーる 対戦履歴', robots: { index: false, follow: false } };

/** Opens in the launchpad, over the room (places.ts). */
export default function Page() { return <Suspense><OpenInRoom section="history" /></Suspense>; }
