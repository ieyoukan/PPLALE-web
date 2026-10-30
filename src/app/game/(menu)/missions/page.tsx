import { Suspense } from 'react';
import type { Metadata } from 'next';
import { OpenInRoom } from '@/components/game/launchpad/OpenInRoom';

export const metadata: Metadata = { title: 'ぷぷりえーる 初心者ミッション', robots: { index: false, follow: true } };

export default function Page() { return <Suspense><OpenInRoom section="missions" /></Suspense>; }
