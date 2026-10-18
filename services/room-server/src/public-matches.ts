import { createValueEvaluator, valueModel } from '@pplale/game-core/ai';
import { HIDDEN_CARD, viewFor } from '@pplale/game-core';
import type { Catalog } from '@pplale/game-core';
import type { FreeMatchActivity, RoomView } from '@pplale/game-core/room';
import type { Backend } from './backend.ts';
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

export async function freeMatchActivity(backend: Backend): Promise<FreeMatchActivity> {
    const queue = await backend.freeMatchQueue();
    const waiting = Object.values(queue.entries).flatMap(entry => entry.status === 'waiting' && entry.until > Date.now()
        ? [{ name: Array.from(entry.name.replace(/\p{C}/gu, '').trim()).slice(0, 12).join('') || 'プレイヤー', playable: entry.deck.playable, ...(entry.historyOwners?.find(owner => owner.startsWith('user:')) && { profileId: entry.historyOwners.find(owner => owner.startsWith('user:'))!.slice(5) }) }] : []);
    const rooms = await Promise.all((await backend.ids()).map(id => backend.get(id)));
    const matches = await Promise.all(rooms.flatMap(room => room?.mode === 'free' && room.rules.spectators && (room.status === 'playing' || room.status === 'finished') && room.seats[1] && room.state ? [room] : []).sort((a, b) => Number(b.status === 'playing') - Number(a.status === 'playing') || (b.record?.startedAt ?? 0) - (a.record?.startedAt ?? 0)).slice(0, 30).map(async room => ({
        id: room.id, players: room.seats.map(seat => ({ name: seat!.name, playable: seat!.deck!.playable, ...(seat!.profileId && { profileId: seat!.profileId }) })) as FreeMatchActivity['matches'][number]['players'],
        startedAt: room.record?.startedAt ?? 0, turn: room.state!.turn, watching: await backend.watching(room.id), status: room.status as 'playing' | 'finished',
        ...(room.status === 'finished' && room.record && { replayId: room.record.id }),
    })));
    return { waiting: waiting.slice(0, 100), matches };
}
