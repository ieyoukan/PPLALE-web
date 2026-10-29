import { createValueEvaluator, valueModel } from '@pplale/game-core/ai';
import { HIDDEN_CARD, viewFor } from '@pplale/game-core';
import type { Catalog } from '@pplale/game-core';
import type { RoomView } from '@pplale/game-core/room';
import type { Room } from './rooms.ts';

const evaluate = createValueEvaluator(valueModel);
const estimates = new Map<string, RoomView['assessment']>();
/** Only public cards feed the live estimate. Unrevealed hands and deck order never do. */
export function publicAssessment(room: Room, catalog: Catalog): RoomView['assessment'] {
    if (!room.state || room.state.phase !== 'playing') return undefined;
    const key = `${room.id}:${room.record?.id}:${room.state.revision}`;
    if (estimates.has(key)) return estimates.get(key);
    const state = viewFor(room.state, 'audience');
    for (const player of state.players) player.hand = player.hand.filter(uid => state.cards[uid].revealed);
    const publicCatalog: Catalog = { ...catalog, [HIDDEN_CARD]: { id: HIDDEN_CARD, name: '不明なカード', type: 'yojo', fruit: 'all', cost: 3, attack: 2, hp: 2, effect: '' } };
    const score = state.winner === null ? evaluate(state, 0, publicCatalog) / valueModel.scale : state.winner === 0 ? 20 : -20;
    const result = { win: 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, score)))), method: 'public-position-value-v1' as const };
    estimates.set(key, result);
    if (estimates.size > 500) estimates.delete(estimates.keys().next().value!);
    return result;
}
