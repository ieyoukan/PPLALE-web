import type { Metadata } from 'next';
import { MatchHistory } from '@/components/game/history/MatchHistory';
export const metadata: Metadata = { title: 'ぷぷりえーる 対戦履歴', robots: { index: false, follow: false } };
export default function Page() { return <MatchHistory />; }
