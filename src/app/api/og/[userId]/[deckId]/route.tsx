import { NextRequest } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebaseAdmin';
import { isValidOgSignature } from '@/lib/ogSignature';
import { getOgDeckImage } from '@/lib/ogDeckImage';

export const runtime = 'nodejs';
const ID_PATTERN = /^[\w-]{1,64}$/;
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest, context: { params: Promise<{ userId: string; deckId: string }> }): Promise<Response> {
  try {
    const { userId, deckId } = await context.params;
    if (!ID_PATTERN.test(userId) || !ID_PATTERN.test(deckId)) return new Response('Bad Request', { status: 400, headers: noStore });
    if (!isValidOgSignature({ userId, deckId, tsParam: request.nextUrl.searchParams.get('ts'), sigParam: request.nextUrl.searchParams.get('sig') })) {
      return new Response('Unauthorized', { status: 401, headers: noStore });
    }
    const deck = await getFirestore(adminApp()).collection('users').doc(userId).collection('decks').doc(deckId).get();
    const data = deck.data();
    if (!deck.exists || !data) return new Response('Not found', { status: 404, headers: noStore });
    const { bytes, etag } = await getOgDeckImage(data);
    const headers = { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=900, s-maxage=900', ETag: etag };
    if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
    return new Response(new Uint8Array(bytes), { headers });
  } catch (error) {
    console.error('OGP画像の生成に失敗しました:', error);
    return new Response('Internal Server Error', { status: 500, headers: noStore });
  }
}
