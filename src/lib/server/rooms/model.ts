// A room as the server keeps it: everything, including both decks and the full match.
import { viewFor } from '@pplale/game-core';
import type { Deck, GameState, Side } from '@pplale/game-core';
import type { RoomRules } from '@/lib/game/room/rules';
import type { LastCommand, RoomStatus, RoomView } from '@/lib/game/room/types';

export interface Seat {
  /** SHA-256 of the seat's secret; the secret itself is only in that player's browser. */
  tokenHash: string;
  /** Id of the document this seat's view is published in. */
  viewKey: string;
  name: string;
  deck: Deck | null;
  ready: boolean;
  /** Went away during or after a match; cleared by anything the seat does later. */
  left?: boolean;
}
export interface Room {
  id: string;
  version: number;
  status: RoomStatus;
  match: number;
  rules: RoomRules;
  seats: [Seat, Seat | null];
  state: GameState | null;
  last: LastCommand | null;
  resigned: Side | null;
}

/** A request that cannot be done; `status` is the HTTP status and `message` is shown to the player. */
export class RoomError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

/** What `seat` is told about the room. */
export function seatView(room: Room, seat: Side): RoomView {
  const { id, version, status, match, rules, last, resigned, seats, state } = room;
  const players = seats.map((s, index) => s && { name: s.name, ready: s.ready, ...(s.left && { left: true }), ...(index === seat && s.deck && { deck: s.deck.name }) }) as RoomView['players'];
  return { id, version, seat, status, match, rules, players, game: state && viewFor(state, seat), last, resigned };
}
