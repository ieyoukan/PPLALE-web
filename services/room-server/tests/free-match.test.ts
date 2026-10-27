import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { HIDDEN_CARD } from '@pplale/game-core';
import { freeMatchRules } from '@pplale/game-core/room';
import type { FreeMatchStatus, RoomServerStats } from '@pplale/game-core/room';
import { connect, deck, serve, shared } from './helpers.ts';

const player = (name: string) => ({ token: randomBytes(32).toString('hex'), name, deck });
type Matched = Extract<FreeMatchStatus, { status: 'matched' }>;
function matched(result: FreeMatchStatus): asserts result is Matched { assert.equal(result.status, 'matched'); }

test('free match pairs across instances, starts chosen decks and keeps hands private', async t => {
    const data = shared(), a = await serve({ data }), b = await serve({ data });
    t.after(async () => { await a.close(); await b.close(); });
    const alice = player('ありす'), bob = player('ぼぶ');
    assert.deepEqual((await a.call('/free-match/start', alice)).data, { status: 'waiting' });
    const second = (await b.call<FreeMatchStatus>('/free-match/start', bob)).data;
    matched(second);
    const first = (await b.call<FreeMatchStatus>('/free-match/status', { token: alice.token })).data;
    matched(first);
    assert.equal(first.roomId, second.roomId);
    assert.notEqual(first.key.seat, second.key.seat);
    assert.equal(first.key.token, alice.token);
    assert.equal(second.key.token, bob.token);
    const socket = await connect(a, first.roomId, first.key.token);
    const view = await socket.until(view => view.status === 'playing');
    assert.equal(view.mode, 'free');
    assert.deepEqual(view.rules, freeMatchRules);
    assert.equal(view.players[0]!.name, alice.name);
    assert.equal(view.players[1]!.name, bob.name);
    assert.ok(view.game!.players[1].yojo.every(uid => view.game!.cards[uid].cardId === HIDDEN_CARD));
    assert.equal(await socket.act({ action: 'rematch' }), 'フリーマッチでは次の対戦相手を探してください');
    const audience = await connect(b, first.roomId, null);
    const watched = await audience.until(view => !!view.watching);
    assert.equal(watched.rules.spectators, true);
    for (const player of watched.game!.players) assert.ok(player.hand.every(uid => watched.game!.cards[uid].cardId === HIDDEN_CARD || watched.game!.cards[uid].revealed));
    // Retrying a request after a lost response must return the same seat, never a new opponent.
    assert.deepEqual((await a.call('/free-match/start', alice)).data, first);
    assert.deepEqual((await b.call('/free-match/cancel', { token: bob.token })).data, second);
    const queue = JSON.stringify(await a.backend.freeMatchQueue());
    assert.ok(!queue.includes(alice.token) && !queue.includes(bob.token));
    const stats = (await a.call<RoomServerStats>('/stats')).data;
    assert.equal(stats.total.matchesStarted, 1);
});

test('free match cancellation is idempotent and wins against a delayed start', async t => {
    const served = await serve();
    t.after(served.close);
    const a = player('A'), b = player('B');
    await served.call('/free-match/start', a);
    assert.deepEqual((await served.call('/free-match/cancel', { token: a.token })).data, { status: 'cancelled' });
    assert.deepEqual((await served.call('/free-match/start', a)).data, { status: 'cancelled' });
    assert.deepEqual((await served.call('/free-match/start', b)).data, { status: 'waiting' });
    const delayed = player('delayed');
    await served.call('/free-match/cancel', { token: delayed.token });
    assert.deepEqual((await served.call('/free-match/start', delayed)).data, { status: 'cancelled' });
    assert.equal((await served.backend.ids()).length, 0);
});

test('free match expired tickets cannot be matched or renewed by status polling', async t => {
    const served = await serve();
    t.after(served.close);
    const a = player('A');
    await served.call('/free-match/start', a);
    const queue = await served.backend.freeMatchQueue(), expected = queue.version++;
    for (const entry of Object.values(queue.entries)) entry.until = Date.now() - 1;
    assert.equal(await served.backend.replaceFreeMatchQueue(queue, expected), true);
    assert.equal((await served.call('/free-match/status', { token: a.token })).status, 410);
    assert.deepEqual((await served.call('/free-match/start', player('B'))).data, { status: 'waiting' });
    assert.equal((await served.backend.ids()).length, 0);
});

test('free match simultaneous requests never pair a player twice', async t => {
    const data = shared(), a = await serve({ data }), b = await serve({ data });
    t.after(async () => { await a.close(); await b.close(); });
    const players = ['A', 'B', 'C', 'D'].map(player);
    const requests = players.flatMap((person, index) => [a, b].map(server => server.call('/free-match/start', { ...person, name: `${person.name}${index}` })));
    const responses = await Promise.all(requests);
    assert.ok(responses.every(response => response.status === 200));
    const results = await Promise.all(players.map(person => a.call<FreeMatchStatus>('/free-match/status', { token: person.token })));
    const rooms = new Map<string, Set<number>>();
    for (const { data: result } of results) {
        matched(result);
        const seats = rooms.get(result.roomId) ?? new Set();
        assert.ok(!seats.has(result.key.seat));
        seats.add(result.key.seat);
        rooms.set(result.roomId, seats);
    }
    assert.equal(rooms.size, 2);
    assert.equal((await a.backend.ids()).length, 2);
});

test('free match validates decks, limits fresh searches and keeps polling available', async t => {
    const served = await serve({ requestsPerHour: 1 });
    t.after(served.close);
    const a = player('A');
    assert.equal((await served.call('/free-match/start', { ...a, deck: { ...deck, yojo: [] } })).status, 400);
    assert.equal((await served.call('/free-match/start', { ...a, token: 'short' })).status, 400);
    assert.equal((await served.call('/free-match/start', a)).status, 200);
    for (let index = 0; index < 3; index++) assert.equal((await served.call('/free-match/status', { token: a.token })).status, 200);
    assert.equal((await served.call('/free-match/start', player('B'))).status, 429);
    assert.equal((await served.call('/free-match/cancel', { token: a.token })).status, 200);
});

test('free match disconnect is forfeited after one minute and the opponent is told', async t => {
    const served = await serve();
    t.after(served.close);
    await served.call('/free-match/start', player('A'));
    const result = (await served.call<FreeMatchStatus>('/free-match/start', player('B'))).data;
    matched(result);
    const socket = await connect(served, result.roomId, result.key.token);
    await socket.until(view => view.players[1]!.online);
    const room = (await served.backend.get(result.roomId))!, expected = room.version++;
    room.away = [Date.now() - 60_001, null];
    assert.equal(await served.backend.replace(room, expected, 60_000), true);
    await served.server.beat();
    const view = await socket.until(view => view.status === 'finished');
    assert.equal(view.resigned, 0);
    assert.equal(view.game!.winner, 1);
    assert.equal(view.players[0]!.left, true);
});
