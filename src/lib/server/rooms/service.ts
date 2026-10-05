// Everything a room can do. The server is the only place a match is played: it checks who is
// asking, runs the command with game-core on the full state, and gives each seat its own view.
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { applyCommand, newGame, other, sandboxRules } from '@pplale/game-core';
import type { Deck, Side } from '@pplale/game-core';
import { gameCatalog } from '@/lib/game/catalog';
import { parseRoomRules, roomDeckErrors } from '@/lib/game/room/rules';
import { MAX_NAME_LENGTH, ROOM_ID_LENGTH, isRoomId } from '@/lib/game/room/types';
import type { RoomCommand, RoomInfo, RoomView, Seated } from '@/lib/game/room/types';
import { RoomError, seatView } from './model';
import type { Room, Seat } from './model';
import { roomStore } from './store';

const side = z.union([z.literal(0), z.literal(1)]);
const uid = z.string().max(16);
const deckKind = z.enum(['yojo', 'sweet']);
// `actor` is replaced by the sender's seat, whatever was sent.
const command = z.discriminatedUnion('type', [
  z.object({ type: z.literal('roll'), actor: side }),
  z.object({ type: z.literal('initiative'), actor: side, order: z.enum(['first', 'second']) }),
  z.object({ type: z.literal('openingDraw'), actor: side, deck: deckKind }),
  z.object({ type: z.literal('mulligan'), actor: side, uids: z.array(uid).max(10) }),
  z.object({ type: z.literal('keep'), actor: side }),
  z.object({ type: z.literal('play'), actor: side, uid, slot: z.number().int().min(0).max(6).optional() }),
  z.object({ type: z.literal('attack'), actor: side, uid, target: uid }),
  z.object({ type: z.literal('end'), actor: side }),
  z.object({ type: z.literal('choose'), actor: side, option: z.string().max(32) }),
  z.object({ type: z.literal('skill'), actor: side, index: z.number().int().min(0).max(8) }),
  z.object({ type: z.literal('reveal'), actor: side, uid }),
]);
const cardIds = z.array(z.string().max(16)).max(40);
const deck = z.object({ name: z.string().max(60), yojo: cardIds, sweet: cardIds, playable: z.string().max(16) });
const action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('ready'), deck }),
  z.object({ action: z.literal('unready') }),
  z.object({ action: z.literal('command'), command, revision: z.number().int() }),
  z.object({ action: z.literal('resign') }),
  z.object({ action: z.literal('rematch') }),
  z.object({ action: z.literal('leave') }),
]);

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const secret = (bytes: number) => randomBytes(bytes).toString('base64url');
/** A name as it is shown to the other player: short, one line, never empty. */
function playerName(value: unknown, fallback: string) {
  const name = typeof value === 'string' ? Array.from(value.replace(/\p{C}/gu, '').trim()).slice(0, MAX_NAME_LENGTH).join('') : '';
  return name || fallback;
}
function newSeat(name: string): { seat: Seat; token: string } {
  const token = secret(32);
  return { seat: { tokenHash: hash(token), viewKey: secret(24), name, deck: null, ready: false }, token };
}
const seated = (room: Room, seat: Side, token: string): Seated =>
  ({ seat, token, viewKey: roomStore().publishes ? room.seats[seat]!.viewKey : null, view: seatView(room, seat) });

/** The seat `token` belongs to. */
function seatOf(room: Room, token: string | null): Side {
  const given = Buffer.from(hash(token ?? ''));
  const index = room.seats.findIndex(seat => seat && timingSafeEqual(Buffer.from(seat.tokenHash), given));
  if (index < 0) throw new RoomError(401, 'このルームの参加者ではありません');
  return index as Side;
}
function roomId(id: string) {
  if (!isRoomId(id)) throw new RoomError(404, 'ルームが見つかりません');
  return id;
}

export async function createRoom(body: unknown): Promise<Seated> {
  const input = body as { rules?: unknown; name?: unknown } | null;
  const rules = parseRoomRules(input?.rules);
  if (!rules) throw new RoomError(400, '使えるフルーツを1つ以上選んでください');
  const { seat, token } = newSeat(playerName(input?.name, 'ホスト'));
  for (let attempt = 0; attempt < 8; attempt++) {
    const id = String(randomInt(10 ** ROOM_ID_LENGTH)).padStart(ROOM_ID_LENGTH, '0');
    const room: Room = { id, version: 1, status: 'lobby', match: 0, rules, seats: [seat, null], state: null, last: null, resigned: null };
    if (await roomStore().create(room)) return seated(room, 0, token);
  }
  throw new RoomError(503, 'ルームを作れませんでした。もう一度お試しください');
}

export async function roomInfo(id: string): Promise<RoomInfo> {
  const room = await roomStore().read(roomId(id));
  return { id: room.id, rules: room.rules, host: room.seats[0].name, open: room.status === 'lobby' && !room.seats[1] };
}

export async function joinRoom(id: string, body: unknown): Promise<Seated> {
  const { seat, token } = newSeat(playerName((body as { name?: unknown } | null)?.name, 'ゲスト'));
  return roomStore().update(roomId(id), room => {
    if (room.status === 'closed') throw new RoomError(410, 'このルームは解散しました');
    if (room.status !== 'lobby' || room.seats[1]) throw new RoomError(409, 'このルームは満員です');
    room.seats[1] = seat;
    room.last = null;
    return seated({ ...room, version: room.version + 1 }, 1, token);
  });
}

export async function readView(id: string, token: string | null): Promise<RoomView> {
  const room = await roomStore().read(roomId(id));
  return seatView(room, seatOf(room, token));
}

/** Random order of the list: card uids follow it, so they must not tell which card is which. */
function mixed(ids: string[]) {
  const result = [...ids];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function startMatch(room: Room) {
  const decks = room.seats.map(seat => ({ ...seat!.deck!, name: seat!.name, yojo: mixed(seat!.deck!.yojo), sweet: mixed(seat!.deck!.sweet) })) as [Deck, Deck];
  room.state = newGame(decks, gameCatalog, { ...sandboxRules }, randomInt(2 ** 32));
  room.status = 'playing';
  room.match++;
  room.resigned = null;
}
function giveUp(room: Room, seat: Side) {
  const state = room.state!;
  state.winner = other(seat);
  state.pending = null;
  state.queue = [];
  state.log.push(`${state.players[seat].name}が投了しました`);
  state.revision++;
  room.status = 'finished';
  room.resigned = seat;
}

/** One request of a seated player. Returns that seat's view afterwards. */
export async function actInRoom(id: string, token: string | null, body: unknown): Promise<RoomView> {
  const parsed = action.safeParse(body);
  if (!parsed.success) throw new RoomError(400, 'リクエストの形式が正しくありません');
  const request = parsed.data;
  return roomStore().update(roomId(id), room => {
    const seat = seatOf(room, token), own = room.seats[seat]!;
    // What the previous command showed belongs to the previous version only.
    room.last = null;
    own.left = false;
    switch (request.action) {
      case 'ready': {
        if (room.status !== 'lobby') throw new RoomError(409, '対戦中はデッキを変えられません');
        const errors = roomDeckErrors(request.deck, room.rules, gameCatalog);
        if (errors.length) throw new RoomError(400, errors.join(' / '));
        own.deck = request.deck;
        own.ready = true;
        if (room.seats.every(s => s?.ready)) startMatch(room);
        break;
      }
      case 'unready':
        if (room.status !== 'lobby') throw new RoomError(409, '対戦はもう始まっています');
        own.ready = false;
        break;
      case 'command': {
        if (room.status !== 'playing' || !room.state) throw new RoomError(409, '対戦中ではありません');
        const state = room.state, sent = { ...request.command, actor: seat } as RoomCommand;
        // During the turns only one side acts, so a command made on an older view is a mistake.
        // The opening draws and the mulligan are done by both sides at once.
        if (state.phase === 'playing' && request.revision !== state.revision) throw new RoomError(409, '盤面が更新されました。もう一度操作してください');
        const cardId = sent.type === 'play' || sent.type === 'reveal' ? state.cards[sent.uid]?.cardId : undefined;
        const result = applyCommand(state, sent, gameCatalog);
        if (result.error) throw new RoomError(422, result.error);
        room.state = result.state;
        room.last = { command: sent, ...(cardId && { cardId }) };
        if (result.state.winner !== null) room.status = 'finished';
        break;
      }
      case 'resign':
        if (room.status !== 'playing' || !room.state) throw new RoomError(409, '対戦中ではありません');
        giveUp(room, seat);
        break;
      case 'rematch':
        if (room.status !== 'finished') throw new RoomError(409, '対戦が終わってから選べます');
        // Back to choosing decks; the next match starts when both are ready again.
        room.status = room.seats[0].left ? 'closed' : 'lobby';
        room.state = null;
        room.resigned = null;
        // A guest who left gives the seat to whoever comes next.
        if (room.seats[1]?.left) room.seats[1] = null;
        for (const s of room.seats) if (s) s.ready = false;
        break;
      case 'leave':
        if (room.status === 'playing' || room.status === 'finished') {
          if (room.status === 'playing') giveUp(room, seat);
          own.left = true;
        } else if (room.status === 'lobby' && seat === 1) {
          // The guest's seat is free again. The view returned is the last one that seat gets.
          const view = seatView(room, seat);
          room.seats[1] = null;
          return { ...view, status: 'closed' as const };
        } else if (room.status === 'lobby') room.status = 'closed';
        break;
    }
    return seatView({ ...room, version: room.version + 1 }, seat);
  });
}
