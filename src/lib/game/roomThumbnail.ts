// What a room's picture shows, chosen from its rules only: the fruits its decks may use (an
// environment, so their number names them), whether extended playables are allowed, and the time
// per turn. The share image (OGP, /api/og/room/) and the room cards in the game use the same choice,
// and nothing about who is in the room or its secret goes into it.
import { fruits } from '@pplale/game-core';
import type { Fruit } from '@pplale/game-core';
import type { RoomRules } from '@pplale/game-core/room';

/** The fruit's colour and picture, as on the 2pick tiles. */
export const fruitArt: Record<Fruit, { tone: string; image: string }> = {
  strawberry: { tone: '#9B4341', image: '/images/fruits/いちご.webp' },
  grape: { tone: '#6E25AB', image: '/images/fruits/ぶどう.webp' },
  melon: { tone: '#40923D', image: '/images/fruits/めろん.webp' },
  orange: { tone: '#E5872C', image: '/images/fruits/おれんじ.webp' },
};

/** Transparent fruit illustrations for rule thumbnails and their shared OGP image. */
export const fruitIllustrations: Record<Fruit, string> = {
  strawberry: '/images/game/fruits/strawberry.webp',
  grape: '/images/game/fruits/grape.webp',
  melon: '/images/game/fruits/melon.webp',
  orange: '/images/game/fruits/orange.webp',
};

export interface RoomThumbnail { fruits: Fruit[]; extended: boolean; turn: 120 | 180 | 300 | null }
export const roomThumbnail = (rules: Pick<RoomRules, 'fruits' | 'extendedPlayable' | 'turnSeconds'>): RoomThumbnail =>
  ({ fruits: fruits.filter(fruit => rules.fruits.includes(fruit)), extended: !!rules.extendedPlayable, turn: rules.turnSeconds ?? null });

/** The share image's address for these rules: `?f=` fruits (how many, in order), `x` extended, `t` seconds. */
export const thumbnailPath = ({ fruits: shown, extended, turn }: RoomThumbnail) =>
  `/api/og/room/?${new URLSearchParams({ f: String(Math.max(1, shown.length)), x: extended ? '1' : '0', t: String(turn ?? 0), v: 'r4' })}`;
export function parseThumbnail(query: URLSearchParams): RoomThumbnail {
  const count = Math.min(fruits.length, Math.max(1, Number(query.get('f')) || 1)), seconds = Number(query.get('t'));
  return { fruits: fruits.slice(0, count), extended: query.get('x') === '1', turn: seconds === 120 || seconds === 180 || seconds === 300 ? seconds : null };
}
