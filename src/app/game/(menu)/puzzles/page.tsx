import { Suspense } from 'react';
import type { Metadata } from 'next';
import { OpenInRoom } from '@/components/game/plaza/OpenInRoom';

export const metadata: Metadata = {
  title: 'ぷぷりえーる ロリの一手を極めるために',
  description: 'このターンで勝利を目指すリーサルパズル。メロン初級・中級の7問に挑戦！',
  alternates: { canonical: '/game/puzzles/' },
};

/** Opens in the launchpad, over the room (places.ts). */
export default function Page() { return <Suspense><OpenInRoom section="puzzles" /></Suspense>; }
