import type { Metadata } from 'next';
import { BattleSoon } from '@/components/game/home/BattleSoon';
export const metadata: Metadata = {
    title: 'ぷぷりえーる バトル',
    description: 'ほかのプレイヤーとの対戦（ルームマッチ）は準備中。',
    alternates: { canonical: '/game/battle/' },
};
export default function Page() {
    return <BattleSoon />;
}
