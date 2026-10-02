import type { Metadata } from 'next';
import BoardEmulator from '@/components/game/BoardEmulator';
export const metadata: Metadata = {
    title: 'ぷぷりえーる 盤面エミュレータ',
    description: 'いちごカードと通常プレイアブルで、ぷぷりえーるの盤面を操作する。',
};
export default function GamePage() {
    return <BoardEmulator />;
}
