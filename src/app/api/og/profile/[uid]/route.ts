import { NextRequest } from 'next/server';
import { getOgProfileImage, profileOgVersion, readOgProfile } from '@/lib/ogProfileImage';

export const runtime = 'nodejs';
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest, context: { params: Promise<{ uid: string }> }): Promise<Response> {
  try {
    const profile = await readOgProfile((await context.params).uid);
    if (!profile) return new Response('Not found', { status: 404, headers: noStore });
    const etag = `"${profileOgVersion(profile)}"`;
    // The page links with ?v=<content hash>, so a versioned URL never changes and may be cached for long.
    const versioned = request.nextUrl.searchParams.get('v') === profileOgVersion(profile);
    const headers = { 'Content-Type': 'image/jpeg', 'Cache-Control': versioned ? 'public, max-age=86400, s-maxage=31536000, immutable' : 'public, max-age=300, s-maxage=900', ETag: etag };
    if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
    return new Response(new Uint8Array(await getOgProfileImage(profile)), { headers });
  } catch (error) {
    console.error('プロフィールのOGP画像の生成に失敗しました:', error);
    return new Response('Internal Server Error', { status: 500, headers: noStore });
  }
}
