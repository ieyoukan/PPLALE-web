import type { Metadata } from 'next';
import { FreeMatch } from '@/components/game/room/FreeMatch';

export const metadata: Metadata = {
    title: 'ぷぷりえーる フリーマッチ',
    description: 'デッキを選んで対戦相手を探そう。ルームIDなしで遊べる、ランクなしのオンライン対戦。',
    alternates: { canonical: '/game/battle/free/' },
};
export default function Page() {
    return <FreeMatch />;
}
