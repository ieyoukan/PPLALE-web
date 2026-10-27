import { NextRequest } from 'next/server';
import { getOgRoomImage } from '@/lib/ogRoomImage';
import { parseThumbnail } from '@/lib/game/roomThumbnail';

export const runtime = 'nodejs';

/** A room's share picture, by its rules only (`?f=&x=&t=`): the same rules always give the same image. */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const jpeg = await getOgRoomImage(parseThumbnail(request.nextUrl.searchParams));
    return new Response(new Uint8Array(jpeg), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400, s-maxage=31536000, immutable' } });
  } catch (error) {
    console.error('ルームのOGP画像の生成に失敗しました:', error);
    return new Response('Internal Server Error', { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
