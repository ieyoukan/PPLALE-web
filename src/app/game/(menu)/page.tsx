import type { Metadata } from 'next';
import GameLobby from '@/components/game/GameLobby';
export const metadata: Metadata = {
    title: 'ぷぷりえーる CPU対決',
    description: 'デッキとCPUの強さを選んで、ぷぷりえーるの対戦を始める。CPU同士の観戦もできる。',
    alternates: { canonical: '/game/' },
};
export default function Page() {
    return <GameLobby kind="solo" />;
}
