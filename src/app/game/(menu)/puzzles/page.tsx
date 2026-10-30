import { Suspense } from 'react';
import type { Metadata } from 'next';
import { OpenInRoom } from '@/components/game/launchpad/OpenInRoom';

export const metadata: Metadata = {
  title: 'ぷぷりえーる ロリの一手を極めるために',
  description: 'このターンで勝利を目指すリーサルパズル。遊び方を学ぶ入門編5問と、イチゴ・ぶどう・メロンの初級から上級まで、全30問に挑戦！',
  alternates: { canonical: '/game/puzzles/' },
};

/** Opens in the launchpad, over the room (places.ts). */
export default function Page() { return <Suspense><OpenInRoom section="puzzles" /></Suspense>; }
