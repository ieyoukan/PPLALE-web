import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog } from '../src/catalog.ts';
import { actPlaza, admit, createPlaza, plazaView, playCpu } from '../src/plaza.ts';
import { deck } from './helpers.ts';

const rules = { fruits: ['strawberry' as const], extendedPlayable: false };
function cpuMatch(seat: 0 | 1 = 0) {
    const { room } = createPlaza('123456', { rules, plaza: { visibility: 'public' } }, { name: 'あなた', historyOwners: ['device:host'] });
    const me = room.plaza!.owner!, act = (body: { action: string; [key: string]: unknown }) => actPlaza(room, me, body.action === 'abort' ? { match: room.match, ...body } : body, catalog);
    act({ action: 'sit', seat });
    act({ action: 'cpu', seat: 1 - seat, level: 'easy' });
    act({ action: 'ready', deck });
    return { room, me, act };
}

test('abort: either human seat can interrupt CPU preparation or play without a result, retaining the room and decks', () => {
    for (const seat of [0, 1] as const) {
        const { room, me, act } = cpuMatch(seat), record = room.record!.id, match = room.match;
        const members = structuredClone(room.plaza!.members), seats = structuredClone(room.seats);
        act({ action: 'rules', rules: { ...rules, turnSeconds: 120 } });
        const result = act({ action: 'abort' });
        assert.equal(result.finished, undefined);
        assert.equal(room.status, 'lobby'); assert.equal(room.state, null); assert.equal(room.record, undefined);
        assert.equal(room.last, null); assert.equal(room.resigned, null); assert.equal(room.turnClock, undefined);
        assert.equal(room.discardedMatch, record); assert.equal(room.match, match);
        assert.equal(room.plaza!.owner, me); assert.deepEqual(room.plaza!.members, members);
        assert.equal(room.seats[seat]!.member, me); assert.equal(room.seats[seat]!.ready, false);
        assert.deepEqual(room.seats[seat]!.deck, seats[seat]!.deck);
        assert.equal(room.rules.turnSeconds, 120); assert.equal(room.plaza!.nextRules, undefined);
        const view = plazaView(room, me, new Set([me]), catalog);
        assert.equal(view.game, null); assert.equal(view.matchId, undefined); assert.equal(view.replayId, undefined);
        assert.throws(() => act({ action: 'abort' }), /対戦中ではありません/);
        assert.throws(() => playCpu(room, (1 - seat) as 0 | 1, { type: 'roll', actor: (1 - seat) as 0 | 1 }, { match, revision: 0 }, catalog), /stale/);
        act({ action: 'ready', deck });
        assert.equal(room.status, 'playing'); assert.equal(room.match, match + 1); assert.notEqual(room.record!.id, record);
        const restarted = structuredClone(room);
        assert.throws(() => act({ action: 'abort', match }), /試合が切り替わりました/);
        assert.deepEqual(room, restarted);
    }
});

test('abort: spectators and human opponents cannot discard a match; resign still records a loss', () => {
    const { room, me, act } = cpuMatch();
    const watcher = admit(room, { name: '観戦' }).member;
    const before = structuredClone(room);
    assert.throws(() => actPlaza(room, watcher.id, { action: 'abort', match: room.match }, catalog), /席に座って/);
    assert.deepEqual(room, before);
    act({ action: 'resign' });
    assert.equal(room.status, 'finished'); assert.equal(room.state!.winner, 1); assert.equal(room.record!.reason, 'resign');
    assert.throws(() => act({ action: 'abort' }), /対戦中ではありません/);
    act({ action: 'rematch' }); act({ action: 'dismissCpu' });
    actPlaza(room, watcher.id, { action: 'sit', seat: 1 }, catalog);
    act({ action: 'ready', deck }); actPlaza(room, watcher.id, { action: 'ready', deck }, catalog);
    const human = structuredClone(room);
    for (const id of [me, watcher.id]) assert.throws(() => actPlaza(room, id, { action: 'abort', match: room.match }, catalog), /CPUとの対戦だけ/);
    assert.deepEqual(room, human);
    act({ action: 'resign' });
    assert.equal(room.state!.winner, 1); assert.equal(room.discardedMatch, undefined);
});
