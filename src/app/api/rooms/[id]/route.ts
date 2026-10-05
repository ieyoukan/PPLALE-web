// GET  /api/rooms/{id}/  with a seat's token: that seat's view. Without one: what a visitor may know.
// POST /api/rooms/{id}/  { action: 'join', name } → a seat.  With a token: { action: 'ready' | 'unready' |
//                        'command' | 'resign' | 'rematch' | 'leave', … } → the seat's view afterwards.
import { answer, bearer, jsonBody } from '@/lib/server/rooms/http';
import { actInRoom, joinRoom, readView, roomInfo } from '@/lib/server/rooms/service';

export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  return answer(async () => {
    const { id } = await params, token = bearer(request);
    return token ? readView(id, token) : roomInfo(id);
  });
}

export async function POST(request: Request, { params }: Context) {
  return answer(async () => {
    const { id } = await params, body = await jsonBody(request);
    return (body as { action?: unknown } | null)?.action === 'join' ? joinRoom(id, body) : actInRoom(id, bearer(request), body);
  });
}
