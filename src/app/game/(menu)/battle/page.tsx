import type { Metadata } from 'next';
import GameLobby from '@/components/game/GameLobby';
export const metadata: Metadata = {
    title: 'ぷぷりえーる バトル',
    description: '同じ端末でふたり対戦する。ルームマッチは準備中。',
    alternates: { canonical: '/game/battle/' },
};
export default function Page() {
    return <GameLobby kind="battle" />;
}
