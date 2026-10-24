import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { defaultRoomRules, describeMatchRules, isRoomId } from '@pplale/game-core/room';
import type { RoomInfo } from '@pplale/game-core/room';
import { gameViewport } from '@/components/game/stage/gameViewport';
// The turn announcement is styled with Panda; its stylesheet is loaded per route, not globally.
import '@/app/panda.css';
import { RoomPage } from '@/components/game/plaza/RoomPage';
import { visibilityInfo } from '@/components/game/plaza/visibility';
import { roomThumbnail, thumbnailPath } from '@/lib/game/roomThumbnail';

export const viewport = gameViewport;
type Props = { params: Promise<{ roomId: string }>; searchParams: Promise<{ invite?: string | string[] }> };

/** What the room server tells anyone with this link (a room only invited people may enter needs its invitation). */
async function readShared(id: string, invite: string | null): Promise<RoomInfo | null> {
  const server = (process.env.NEXT_PUBLIC_ROOM_SERVER_URL ?? '').replace(/\/+$/, '');
  if (!server) return null;
  try {
    const response = await fetch(`${server}/rooms/${id}${invite ? `?${new URLSearchParams({ invite })}` : ''}`, { cache: 'no-store', signal: AbortSignal.timeout(1500) });
    return response.ok ? await response.json() as RoomInfo : null;
  } catch { return null; }
}

/**
 * The card a chat app shows for the link: the room's name and rules where the link may know them, its
 * rules' picture (the same for every room with those rules). A room the link does not let in gets the
 * common words and picture. The invitation itself is in no title, text, picture or address.
 */
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { roomId } = await params, { invite } = await searchParams;
  const room = isRoomId(roomId) ? await readShared(roomId, typeof invite === 'string' ? invite : null) : null;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://pplale.pgw.jp';
  const rules = room?.rules ?? defaultRoomRules;
  const closed = room?.status === 'closed';
  const title = !room ? 'ぷぷりえーるのルームにさそわれました' : closed ? '閉じたルーム｜ぷぷりえーる' : `${room.plaza?.name ?? `${room.host}のルーム`}｜ぷぷりえーる`;
  const description = !room ? 'リンクを開いて、いっしょに遊ぼう。'
    : closed ? 'このルームは閉じました。ゲームを開くと新しいルームで遊べます。'
      : [room.plaza && visibilityInfo[room.plaza.visibility].label, describeMatchRules(rules), room.plaza && `${room.plaza.members}人がいます`].filter(Boolean).join('・');
  const image = { url: new URL(thumbnailPath(roomThumbnail(rules)), baseUrl).toString(), width: 800, height: 420, alt: 'ぷぷりえーるのルーム' };
  const url = `${baseUrl}/game/room/${roomId}/`;
  return {
    title, description, robots: { index: false, follow: true },
    openGraph: { title, description, images: [image], type: 'website', url },
    twitter: { card: 'summary_large_image', title, description, images: [image.url] },
  };
}

/** One room's link: waiting, watching and its matches are all here. */
export default async function Page({ params }: Props) {
  const { roomId } = await params;
  if (!isRoomId(roomId)) notFound();
  // The invitation (`?invite=`) is read in the browser.
  return <Suspense><RoomPage id={roomId} /></Suspense>;
}
