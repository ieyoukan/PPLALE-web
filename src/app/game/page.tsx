import type { Metadata } from 'next';
import GameLobby from '@/components/game/GameLobby';
export const metadata: Metadata = {
    title: 'ぷぷりえーる ゲームの準備',
    description: 'いちごカードと通常プレイアブルで、ぷぷりえーるの対戦を準備する。CPUと対戦、両側を操作、CPU同士の観戦を選べる。',
    alternates: { canonical: '/game/' },
};
export default function GamePage() {
    return <GameLobby />;
}
