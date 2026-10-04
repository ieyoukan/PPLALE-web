import type { Metadata } from 'next';
// The turn announcement is styled with Panda; its stylesheet is loaded per route, not globally.
import '@/app/panda.css';
import BoardEmulator from '@/components/game/BoardEmulator';
// The board only shows the match prepared on /game/ (kept in the browser), so there is nothing to index.
export const metadata: Metadata = {
    title: 'ぷぷりえーる 対戦',
    description: 'ぷぷりえーるの盤面で対戦する。',
    alternates: { canonical: '/game/' },
    robots: { index: false, follow: true },
};
export default function GamePlayPage() {
    return <BoardEmulator />;
}
