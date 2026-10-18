import { Suspense } from 'react';
import type { Metadata } from 'next';
import { RecordedReplay } from '@/components/game/history/RecordedReplay';
export const metadata: Metadata = { title: 'ぷぷりえーる リプレイ', robots: { index: false, follow: false } };
export default function Page() { return <Suspense><RecordedReplay /></Suspense>; }
