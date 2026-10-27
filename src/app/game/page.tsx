import type { Metadata } from 'next';
import { Launcher } from '@/components/game/plaza/Launcher';
export const metadata: Metadata = {
    title: 'ぷぷりえーる',
    description: 'ぷぷりえーるのカードゲーム。ルームでフレンドと集まって、対戦や観戦、CPU戦を楽しもう。',
    alternates: { canonical: '/game/' },
};
/** Opening the game: the room this browser is in, or a new one (the page is the launch screen until then). */
export default function Page() {
    return <Launcher />;
}
