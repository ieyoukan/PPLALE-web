import { Suspense } from 'react';
import type { Metadata } from 'next';
// The turn announcement is styled with Panda; its stylesheet is loaded per route, not globally.
import '@/app/panda.css';
import { RecordedReplay } from '@/components/game/history/RecordedReplay';
export const metadata: Metadata = { title: 'ぷぷりえーる リプレイ', robots: { index: false, follow: false } };
export default function Page() { return <Suspense><RecordedReplay /></Suspense>; }
