// POST /api/rooms/  { rules, name } → the new room and the host's seat.
import { answer, jsonBody } from '@/lib/server/rooms/http';
import { createRoom } from '@/lib/server/rooms/service';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return answer(async () => createRoom(await jsonBody(request)));
}
