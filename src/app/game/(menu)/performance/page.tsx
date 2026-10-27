import { Suspense } from 'react';
import type { Metadata } from 'next';
import { OpenInRoom } from '@/components/game/launchpad/OpenInRoom';

export const metadata: Metadata = { title: 'ぷぷりえーる 通信計測', robots: { index: false, follow: false } };

/** Opens in the launchpad, over the room (places.ts). */
export default function Page() { return <Suspense><OpenInRoom section="performance" /></Suspense>; }
