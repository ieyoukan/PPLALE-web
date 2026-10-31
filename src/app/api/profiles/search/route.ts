import { NextRequest } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp, verifiedUid } from '@/lib/firebaseAdmin';
import { foldName, MAX_NAME_LENGTH, SEARCH_LIMIT } from '@/lib/game/profileSearch';

export const runtime = 'nodejs';
const noStore = { 'Cache-Control': 'private, no-store' };

/**
 * Name search for signed-in players. Firestore rules keep `profiles` unlistable, so the server runs one
 * `array-contains` query (at most SEARCH_LIMIT results, no paging) and returns only the public fields.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return Response.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const query = foldName(request.nextUrl.searchParams.get('q') ?? '');
  if (!query || Array.from(query).length > MAX_NAME_LENGTH) return Response.json({ profiles: [] }, { headers: noStore });
  try {
    const uid = await verifiedUid(token);
    if (!uid) return Response.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
    const found = await getFirestore(adminApp()).collection('profiles').where('nameGrams', 'array-contains', query).limit(SEARCH_LIMIT + 1).get();
    const profiles = found.docs.flatMap(doc => {
      const data = doc.data();
      // The grams are written by each owner: show a profile only if its actual name matches.
      if (doc.id === uid || data.searchable !== true || typeof data.displayName !== 'string' || !foldName(data.displayName).includes(query)) return [];
      return [{ uid: doc.id, displayName: data.displayName, comment: typeof data.comment === 'string' ? data.comment : '', iconCardId: data.iconCardId }];
    }).slice(0, SEARCH_LIMIT);
    return Response.json({ profiles }, { headers: noStore });
  } catch (error) {
    console.error('プロフィール検索に失敗しました:', error);
    return Response.json({ error: 'failed' }, { status: 500, headers: noStore });
  }
}
