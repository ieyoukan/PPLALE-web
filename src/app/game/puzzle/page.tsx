import type { Metadata } from 'next';
import { Suspense } from 'react';
import PuzzlePlay from '@/components/game/puzzles/PuzzlePlay';
import '@/app/panda.css';

export const metadata: Metadata = {
  title: 'ぷぷりえーる リーサルパズルに挑戦',
  alternates: { canonical: '/game/puzzles/' },
  robots: { index: false, follow: true },
};

export default function Page() { return <Suspense fallback={null}><PuzzlePlay /></Suspense>; }
