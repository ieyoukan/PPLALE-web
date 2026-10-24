import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isRoomId } from '@pplale/game-core/room';
import { gameViewport } from '@/components/game/stage/gameViewport';
// The turn announcement is styled with Panda; its stylesheet is loaded per route, not globally.
import '@/app/panda.css';
import { RoomPage } from '@/components/game/plaza/RoomPage';

export const metadata: Metadata = {
    title: 'ぷぷりえーる ルーム',
    description: 'ぷぷりえーるのルームにさそわれました。リンクを開いて、いっしょに遊ぼう。',
    robots: { index: false, follow: true },
};
export const viewport = gameViewport;

/** One room's link: waiting, watching and its matches are all here. */
export default async function Page({ params }: { params: Promise<{ roomId: string }> }) {
    const { roomId } = await params;
    if (!isRoomId(roomId)) notFound();
    // The invitation (`?invite=`) is read in the browser.
    return <Suspense><RoomPage id={roomId} /></Suspense>;
}
