import type { Metadata } from 'next';
import PuzzleLobby from '@/components/game/puzzles/PuzzleLobby';

export const metadata: Metadata = {
  title: 'ぷぷりえーる ロリの一手を極めるために',
  description: 'このターンで勝利を目指すリーサルパズル。メロン初級・中級の7問に挑戦！',
  alternates: { canonical: '/game/puzzles/' },
};

export default function Page() { return <PuzzleLobby />; }
