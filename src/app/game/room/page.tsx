import { Suspense } from 'react';
import type { Metadata } from 'next';
// The turn announcement is styled with Panda; its stylesheet is loaded per route, not globally.
import '@/app/panda.css';
import RoomBoard from '@/components/game/room/RoomBoard';
export const metadata: Metadata = {
    title: 'ぷぷりえーる ルームマッチ',
    description: 'ぷぷりえーるのルームマッチの盤面。',
    alternates: { canonical: '/game/battle/' },
    robots: { index: false, follow: true },
};
export default function Page() {
    // The room id is read from the query string in the browser.
    return <Suspense><RoomBoard /></Suspense>;
}
