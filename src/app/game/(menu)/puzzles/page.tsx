import type { Metadata } from 'next';
import { Suspense } from 'react';
import PuzzleLobby from '@/components/game/puzzles/PuzzleLobby';

export const metadata: Metadata = {
  title: 'ぷぷりえーる ロリの一手を極めるために',
  description: 'このターンで勝利を目指すリーサルパズル。イチゴ・ぶどう・メロンの初級から上級まで、全25問に挑戦！',
  alternates: { canonical: '/game/puzzles/' },
};

export default function Page() { return <Suspense fallback={null}><PuzzleLobby /></Suspense>; }
