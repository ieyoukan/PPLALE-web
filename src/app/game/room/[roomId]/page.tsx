import { Suspense } from 'react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { defaultRoomRules, describeMatchRules, isRoomId } from '@pplale/game-core/room';
import type { RoomInfo } from '@pplale/game-core/room';
import { gameViewport } from '@/components/game/stage/gameViewport';
// The turn announcement is styled with Panda; its stylesheet is loaded per route, not globally.
import '@/app/panda.css';
import { RoomPage } from '@/components/game/plaza/RoomPage';
import { visibilityInfo } from '@/components/game/plaza/visibility';
import { roomThumbnail, thumbnailPath } from '@/lib/game/roomThumbnail';
import { detectAppLocale } from '@/i18n/config';

export const viewport = gameViewport;
type Props = { params: Promise<{ roomId: string }>; searchParams: Promise<{ invite?: string | string[] }> };
/** The fetchers of link previews (Discord, X, LINE, Slack, …), as opposed to someone opening the link. */
const PREVIEW = /bot|crawl|spider|preview|facebookexternalhit|discord|slack|twitter|line\/|whatsapp|telegram|skype|embedly|pinterest|vkshare|mastodon|misskey|bluesky|cardyb/i;

/** What the room server tells anyone with this link (a room only invited people may enter needs its invitation). */
/**
 * The link card's words in the fetcher's language: English only when it asks for another language than
 * Japanese (most chat apps send none, and get Japanese as before).
 */
async function previewWords(acceptLanguage: string | null) {
  const fill = (text: string, vars?: Record<string, string | number>) => vars ? text.replace(/\{(\w+)\}/g, (whole, name: string) => name in vars ? String(vars[name]) : whole) : text;
  if (!acceptLanguage || detectAppLocale(acceptLanguage, null) !== 'en') return { t: fill, gameText: (text: string) => text };
  const { gameEnglish } = await import('@/i18n/en/game');
  return { t: (text: string, vars?: Record<string, string | number>) => fill(gameEnglish.text[text] ?? text, vars), gameText: gameEnglish.translate };
}

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
  // Only a chat app's link preview needs the room's words; people opening the link see the room itself.
  const request = await headers();
  const preview = PREVIEW.test(request.get('user-agent') ?? '');
  const { t, gameText } = await previewWords(request.get('accept-language'));
  const room = preview && isRoomId(roomId) ? await readShared(roomId, typeof invite === 'string' ? invite : null) : null;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://pplale.pgw.jp';
  const rules = room?.rules ?? defaultRoomRules;
  const closed = room?.status === 'closed';
  const title = !room ? t('ぷぷりえーるのルームにさそわれました') : closed ? t('閉じたルーム｜ぷぷりえーる') : t('{name}｜ぷぷりえーる', { name: room.plaza?.name ?? t('{name}のルーム', { name: room.host }) });
  const description = !room ? t('リンクを開いて、いっしょに遊ぼう。')
    : closed ? t('このルームは閉じました。ゲームを開くと新しいルームで遊べます。')
      : [room.plaza && t(visibilityInfo[room.plaza.visibility].label), gameText(describeMatchRules(rules)), room.plaza && t('{count}人がいます', { count: room.plaza.members })].filter(Boolean).join(t('・'));
  const image = { url: new URL(thumbnailPath(roomThumbnail(rules)), baseUrl).toString(), width: 800, height: 420, alt: t('ぷぷりえーるのルーム') };
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
