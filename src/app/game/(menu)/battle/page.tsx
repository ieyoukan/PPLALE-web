import type { Metadata } from 'next';
import { RoomEntrance } from '@/components/game/room/RoomEntrance';
export const metadata: Metadata = {
    title: 'ぷぷりえーる バトル',
    description: 'ルームを作って友だちを招待し、ぷぷりえーるで対戦する（ルームマッチ）。',
    alternates: { canonical: '/game/battle/' },
};
export default function Page() {
    return <RoomEntrance />;
}
