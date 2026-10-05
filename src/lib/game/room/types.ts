// What the browser and the server exchange about a room.
import type { Command, Deck, GameState, Side } from '@pplale/game-core';
import type { RoomRules } from './rules';

/** lobby: choosing decks. playing / finished: a match. closed: the host left before a match. */
export type RoomStatus = 'lobby' | 'playing' | 'finished' | 'closed';

/** A command the other side may see: never a test command, and always from the sender's own seat. */
export type RoomCommand = Exclude<Command, { type: 'adjust' | 'draw' }>;

/** The command that led to `game`, so the other side can show it happening. */
export interface LastCommand {
  command: RoomCommand;
  /** The card a `play` / `reveal` showed, which the other side's previous view did not know. */
  cardId?: string;
}

/** A room as one seat sees it. `game` hides what that seat may not know (`viewFor`). */
export interface RoomView {
  id: string;
  /** Grows with every change of the room; an older view never replaces a newer one. */
  version: number;
  seat: Side;
  status: RoomStatus;
  /** Counts the matches played in this room; a new number means a new match. */
  match: number;
  rules: RoomRules;
  /** Index = seat. The second is null until someone joins. */
  players: [RoomPlayer, RoomPlayer | null];
  game: GameState | null;
  last: LastCommand | null;
  /** The seat that gave up the current match. */
  resigned: Side | null;
}
export interface RoomPlayer {
  name: string;
  ready: boolean;
  /** Left the room during or after a match. */
  left?: boolean;
  /** Only told to the seat itself. */
  deck?: string;
}

/** What someone without a seat may know (the page a shared link opens). */
export interface RoomInfo {
  id: string;
  rules: RoomRules;
  host: string;
  /** A seat is free and no match has started. */
  open: boolean;
}

/** A seat: the secret that acts for it, and where its view can be listened to (null: ask the API). */
export interface SeatKey {
  seat: Side;
  token: string;
  viewKey: string | null;
}
export interface Seated extends SeatKey {
  view: RoomView;
}

export type RoomAction =
  | { action: 'ready'; deck: Deck }
  | { action: 'unready' }
  | { action: 'command'; command: RoomCommand; revision: number }
  | { action: 'resign' }
  | { action: 'rematch' }
  | { action: 'leave' };

export const ROOM_ID_LENGTH = 6;
export const isRoomId = (value: unknown): value is string => typeof value === 'string' && /^\d{6}$/.test(value);
export const MAX_NAME_LENGTH = 12;
