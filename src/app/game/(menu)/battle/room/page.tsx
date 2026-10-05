import { Suspense } from 'react';
import type { Metadata } from 'next';
import { RoomLobby } from '@/components/game/room/RoomLobby';
// The page an invitation links to (`?id=`): what a chat app shows for the link comes from here.
export const metadata: Metadata = {
    title: 'ぷぷりえーる ルームマッチ',
    description: 'ぷぷりえーるのルームマッチに招待されました。リンクを開いて対戦に参加しよう。',
    alternates: { canonical: '/game/battle/' },
    robots: { index: false, follow: true },
};
export default function Page() {
    // The room id is read from the query string in the browser.
    return <Suspense><RoomLobby /></Suspense>;
}
