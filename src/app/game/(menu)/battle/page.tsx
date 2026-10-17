import type { Metadata } from 'next';
import { RoomEntrance } from '@/components/game/room/RoomEntrance';
export const metadata: Metadata = {
    title: 'ぷぷりえーる バトル',
    description: 'フリーマッチで対戦相手を探したり、ルームマッチに友だちを招待したりして、ぷぷりえーるで対戦しよう。',
    alternates: { canonical: '/game/battle/' },
};
export default function Page() {
    return <RoomEntrance />;
}
