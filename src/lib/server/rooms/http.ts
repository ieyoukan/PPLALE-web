import { RoomError } from './model';

const MAX_BODY = 16 * 1024;

/** The JSON body, or null when it is missing, too large or not JSON. */
export async function jsonBody(request: Request): Promise<unknown> {
  try {
    const text = await request.text();
    return text.length > MAX_BODY ? null : JSON.parse(text);
  } catch { return null; }
}

export const bearer = (request: Request) => /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1] ?? null;

/** Answers with what `work` returns; a RoomError becomes its status and message. Never cached. */
export async function answer(work: () => Promise<unknown>): Promise<Response> {
  const headers = { 'cache-control': 'no-store' };
  try {
    return Response.json(await work(), { headers });
  } catch (error) {
    if (error instanceof RoomError) return Response.json({ error: error.message }, { status: error.status, headers });
    console.error('room request failed', error);
    return Response.json({ error: 'サーバーで問題が起きました。少し待ってからお試しください' }, { status: 500, headers });
  }
}
