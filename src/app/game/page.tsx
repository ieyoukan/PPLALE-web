import type { Metadata } from 'next';
import GameHome from '@/components/game/home/GameHome';
export const metadata: Metadata = {
    title: 'ぷぷりえーる ゲーム',
    description: 'ぷぷりえーるのカードゲーム。CPUとの対決、ふたりでのバトル、カード図鑑とデッキ構築への入口。',
    alternates: { canonical: '/game/' },
};
export default function Page() {
    return <GameHome />;
}
