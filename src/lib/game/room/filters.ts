import type { Fruit } from '@pplale/game-core';
import type { RoomInfo } from '@pplale/game-core/room';

// One matching rule for public discovery, friend locations and named invitations.
export interface RoomRuleFilter { fruit: Fruit | 'any'; extended: 'any' | 'normal' | 'extended'; turn: 'any' | 'none' | '120' | '180' | '300' }
export const allRoomRules: RoomRuleFilter = { fruit: 'any', extended: 'any', turn: 'any' };

export function matchesRoomRules(room: RoomInfo, filter: RoomRuleFilter) {
  return (filter.fruit === 'any' || room.rules.fruits.at(-1) === filter.fruit)
    && (filter.extended === 'any' || room.rules.extendedPlayable === (filter.extended === 'extended'))
    && (filter.turn === 'any' || (room.rules.turnSeconds ?? 0) === (filter.turn === 'none' ? 0 : Number(filter.turn)));
}
