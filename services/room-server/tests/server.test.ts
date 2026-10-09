import test from 'node:test';
import assert from 'node:assert/strict';
import { HIDDEN_CARD } from '@pplale/game-core';
import type { RoomInfo, RoomServerStats, Seated } from '@pplale/game-core/room';
import { connect, deck, seatedRoom, serve, shared, startedMatch } from './helpers.ts';

const rules = { fruits: ['strawberry'], extendedPlayable: false, spectators: false };

test('rooms: made with the rules the game can play, looked up and joined once', async () => {
    const served = await serve(), { call } = served;
    const made = await call<Seated>('/rooms', { rules: { fruits: ['strawberry', 'grape'], extendedPlayable: true }, name: '  ほすと\n太郎ながいなまえです ' });
    assert.equal(made.status, 200);
    const { view } = made.data;
    assert.match(view.id, /^\d{6}$/);
    const supportedRules = { ...rules, fruits: ['strawberry', 'grape'] };
    assert.deepEqual(view.rules, supportedRules);
    assert.equal(view.players[0].name, 'ほすと太郎ながいなまえで');
    assert.equal((await call('/rooms', { rules: { fruits: ['grape'] } })).status, 200);
    assert.equal((await call('/rooms', { rules: { fruits: ['orange'] } })).status, 200);
    assert.equal((await call('/rooms', { rules: { fruits: ['melon'] } })).status, 400);

    const info = await call<RoomInfo>(`/rooms/${view.id}`);
    assert.deepEqual(info.data, { id: view.id, rules: supportedRules, host: 'ほすと太郎ながいなまえで', open: true, spectators: false });
    assert.equal((await call('/rooms/000')).status, 404);
    assert.equal((await call('/rooms/999999')).status, 404);

    const joined = await call<Seated>(`/rooms/${view.id}/join`, {});
    assert.equal(joined.data.seat, 1);
    assert.equal(joined.data.view.players[1]?.name, 'ゲスト');
    assert.equal((await call(`/rooms/${view.id}/join`, {})).status, 409);
    assert.equal((await call<RoomInfo>(`/rooms/${view.id}`)).data.open, false);
    await served.close();
});

test('sockets: only a seat gets in, and each side is told when the other comes and goes', async () => {
    const served = await serve();
    const { id, host, sockets: [a, b] } = await seatedRoom(served);
    const stranger = await connect(served, id, 'not-a-token');
    assert.equal(await stranger.closed, 4404);
    assert.equal(stranger.gone(), 'このルームの参加者ではありません');
    assert.equal(await (await connect(served, '123456', host.token)).closed, 4404);

    await b.close();
    assert.equal((await a.until(view => !view.players[1]!.online)).players[1]!.name, 'げすと');
    // A second tab of the same seat gets the view without the other side noticing anything.
    const before = a.views.length, again = await connect(served, id, host.token);
    assert.equal((await again.until(() => true)).seat, 0);
    assert.equal(a.views.length, before);
    await served.close();
});

test('sockets: an origin that is not allowed cannot connect', async () => {
    const served = await serve({ origins: ['https://pplale.vercel.app'] });
    const { data } = await served.call<Seated>('/rooms', { rules });
    await assert.rejects(connect(served, data.view.id, data.token, { origin: 'https://elsewhere.example' }));
    const allowed = await connect(served, data.view.id, data.token, { origin: 'https://pplale.vercel.app' });
    assert.equal((await allowed.until(() => true)).players[0].online, true);
    await served.close();
});

test('lobby: decks are checked against the room, and the match starts when both are ready', async () => {
    const served = await serve();
    const { sockets: [a, b] } = await seatedRoom(served);
    assert.equal(await b.act({ action: 'ready', deck: { ...deck, playable: 'p_6' } }), 'このルームでは拡張プレイアブルを使えません');
    assert.equal(await b.act({ action: 'ready', deck: { ...deck, yojo: [...deck.yojo.slice(1), 'y_40'] } }), 'このルームではぶどうのカードを使えません');
    assert.equal(await a.act({ action: 'ready', deck }), undefined);
    assert.equal(a.latest().players[0].deck, deck.name);
    // The other side learns that the deck is chosen, not which.
    assert.deepEqual((await b.until(view => view.players[0].ready)).players[0], { name: 'ほすと', ready: true, online: true });
    assert.equal(await a.act({ action: 'unready' }), undefined);
    assert.equal(await b.act({ action: 'ready', deck }), undefined);
    assert.equal(b.latest().status, 'lobby');
    assert.equal(await a.act({ action: 'ready', deck }), undefined);
    for (const socket of [a, b]) {
        const { game } = await socket.until(view => view.status === 'playing');
        assert.equal(game!.phase, 'dice');
        assert.equal(game!.rng, 0);
        assert.ok(Object.values(game!.cards).every(card => card.cardId === HIDDEN_CARD));
        assert.deepEqual(game!.players.map(player => player.name), ['ほすと', 'げすと']);
    }
    await served.close();
});

test('match: the server plays it; each side sees its own hand, acts only for itself and in turn', async () => {
    const served = await serve();
    const { sockets, first, command } = await startedMatch(served);
    const second = first === 0 ? 1 : 0;
    // A command names its sender's seat, whatever it says.
    for (const seat of [0, 1] as const) {
        while (sockets[seat].latest().game!.openingRemaining[seat] > 0) assert.equal(await command(seat, { type: 'openingDraw', actor: seat === 0 ? 1 : 0, deck: 'yojo' }), undefined);
    }
    for (const seat of [0, 1] as const) assert.equal(await command(seat, { type: 'keep', actor: seat }), undefined);
    const views = await Promise.all(sockets.map(socket => socket.until(view => view.game!.phase === 'playing')));
    const hand = (viewer: 0 | 1, of: 0 | 1) => views[viewer].game!.players[of].hand.map(uid => views[viewer].game!.cards[uid].cardId);
    for (const seat of [0, 1] as const) {
        assert.ok(hand(seat, seat).every(id => id !== HIDDEN_CARD));
        assert.ok(hand(seat, seat === 0 ? 1 : 0).every(id => id === HIDDEN_CARD));
    }
    assert.equal(hand(first, first).length, 3);
    assert.equal(hand(second, second).length, 4);
    // The other side is shown what was done.
    assert.deepEqual(views[first].last, { command: { type: 'keep', actor: 1 } });

    assert.equal(await command(second, { type: 'end', actor: first }), '相手のターンです');
    assert.equal(await sockets[first].act({ action: 'command', command: { type: 'end', actor: first }, revision: views[first].game!.revision - 1 }), '盤面が更新されました。もう一度操作してください');
    assert.equal(await sockets[first].act({ action: 'command', command: { type: 'adjust', actor: first, resource: 'points', delta: -12 } as never, revision: views[first].game!.revision }), 'リクエストの形式が正しくありません');

    // Giving up ends it for both; "once more" brings both back to choosing decks.
    assert.equal(await sockets[second].act({ action: 'resign' }), undefined);
    for (const socket of sockets) {
        const view = await socket.until(latest => latest.status === 'finished');
        assert.equal(view.game!.winner, first);
        assert.equal(view.resigned, second);
        assert.equal(view.last, null);
    }
    assert.equal(await sockets[first].act({ action: 'rematch' }), undefined);
    for (const socket of sockets) {
        const view = await socket.until(latest => latest.status === 'lobby');
        assert.equal(view.game, null);
        assert.ok(view.players.every(player => player && !player.ready));
    }
    await new Promise(resolve => setTimeout(resolve, 250));
    const stats = (await served.call<RoomServerStats>('/stats')).data;
    assert.deepEqual(stats.rooms, { lobby: 1, playing: 0, finished: 0, closed: 0 });
    assert.equal(stats.connections, 2);
    assert.equal(stats.pods, 1);
    assert.deepEqual({ ...stats.total, commands: 0 }, { roomsCreated: 1, matchesStarted: 1, matchesFinished: 1, commands: 0 });
    assert.ok(stats.total.commands >= 12);
    assert.equal(stats.version, 'test');
    await served.close();
});

test('spectators: only where the room allows them; they see both hands, are counted, and cannot act', async () => {
    const data = shared();
    const a = await serve({ data }), b = await serve({ data });
    const closed = await seatedRoom(a);
    const refused = await connect(a, closed.id, null);
    assert.equal(await refused.closed, 4404);
    assert.equal(refused.gone(), 'このルームは観戦できません');
    assert.equal(closed.sockets[0].latest().spectators, 0);

    // The players are on one instance, the spectator on the other.
    const { id, sockets, first, command } = await startedMatch(a, a, true);
    assert.equal((await a.call<RoomInfo>(`/rooms/${id}`)).data.spectators, true);
    const drawer = first === 0 ? 1 : 0;
    assert.equal(await command(drawer, { type: 'openingDraw', actor: drawer, deck: 'yojo' }), undefined);
    assert.equal(await command(first, { type: 'openingDraw', actor: first, deck: 'sweet' }), undefined);
    const watcher = await connect(b, id, null);
    const view = await watcher.until(latest => latest.spectators === 1);
    assert.equal(view.watching, true);
    assert.deepEqual(view.players.map(player => player!.name), ['ほすと', 'げすと']);
    assert.equal(view.players[0].deck, undefined);
    for (const side of [0, 1] as const) {
        const hand = view.game!.players[side].hand.map(uid => view.game!.cards[uid].cardId);
        assert.equal(hand.length, 1);
        assert.ok(hand.every(card => card !== HIDDEN_CARD));
        assert.ok(view.game!.players[side].yojo.every(uid => view.game!.cards[uid].cardId === HIDDEN_CARD));
    }
    // The players learn that someone watches, and still do not see each other's hand.
    for (const socket of sockets) {
        const seen = await socket.until(latest => latest.spectators === 1);
        assert.equal(seen.watching, undefined);
        const foe = seen.seat === 0 ? 1 : 0;
        assert.ok(seen.game!.players[foe].hand.every(uid => seen.game!.cards[uid].cardId === HIDDEN_CARD));
    }
    assert.equal(await watcher.act({ action: 'resign' }), '観戦中は操作できません');
    assert.equal(sockets[0].latest().status, 'playing');
    // What a player does reaches the spectator with what was done.
    assert.equal(await command(drawer, { type: 'openingDraw', actor: drawer, deck: 'yojo' }), undefined);
    assert.deepEqual((await watcher.until(latest => latest.last !== null)).last, { command: { type: 'openingDraw', actor: drawer, deck: 'yojo' } });
    await watcher.close();
    await sockets[0].until(latest => latest.spectators === 0);
    await a.close();
    await b.close();
});

test('leaving: a guest frees the seat, the host closes the room', async () => {
    const served = await serve();
    const { id, sockets: [a, b] } = await seatedRoom(served);
    assert.equal(await b.act({ action: 'leave' }), undefined);
    assert.equal(await b.closed, 4404);
    assert.equal((await a.until(view => !view.players[1])).status, 'lobby');
    assert.equal((await served.call<RoomInfo>(`/rooms/${id}`)).data.open, true);
    assert.equal(await a.act({ action: 'leave' }), undefined);
    assert.equal(a.latest().status, 'closed');
    assert.equal((await served.call(`/rooms/${id}/join`, {})).status, 410);
    await served.close();
});

test('restart: rooms and their matches are still there, and the seats still work', async () => {
    const data = shared();
    const before = await serve({ data });
    const { id, host, first, sockets } = await startedMatch(before);
    const { revision } = sockets[0].latest().game!;
    await before.close();
    assert.equal(await sockets[0].closed, 1012);

    const after = await serve({ data });
    const back = await connect(after, id, host.token);
    const view = await back.until(latest => latest.players[0].online);
    assert.equal(view.status, 'playing');
    assert.equal(view.game!.revision, revision);
    assert.equal(view.game!.rules.firstPlayer, first);
    assert.equal(view.players[1]!.online, false);
    assert.equal(await back.act({ action: 'command', command: { type: 'openingDraw', actor: 0, deck: 'sweet' }, revision }), undefined);
    await after.close();
});

test('two instances: the players of a room may be on different ones, and one can go away', async () => {
    const data = shared();
    const a = await serve({ data }), b = await serve({ data });
    const { id, host, sockets, first, command } = await startedMatch(a, b);
    // What one does on its instance reaches the other on theirs, with what was done.
    const drawer = first === 0 ? 1 : 0;
    assert.equal(await command(drawer, { type: 'openingDraw', actor: drawer, deck: 'yojo' }), undefined);
    const seen = await sockets[first].until(view => view.last?.command.type === 'openingDraw');
    assert.equal(seen.game!.players[drawer].hand.length, 1);
    assert.equal(seen.game!.cards[seen.game!.players[drawer].hand[0]].cardId, HIDDEN_CARD);
    await new Promise(resolve => setTimeout(resolve, 250));
    const stats = (await b.call<RoomServerStats>('/stats')).data;
    assert.equal(stats.pods, 2);
    assert.equal(stats.connections, 2);
    assert.deepEqual(stats.rooms, { lobby: 0, playing: 1, finished: 0, closed: 0 });

    // The host's instance is replaced: the host connects to the other one and plays on.
    await a.close();
    assert.equal(await sockets[0].closed, 1012);
    const moved = await connect(b, id, host.token);
    const view = await moved.until(latest => latest.players[0].online && latest.players[1]!.online);
    assert.equal(view.game!.players[drawer].hand.length, 1);
    assert.equal(await moved.act({ action: 'command', command: { type: 'openingDraw', actor: 0, deck: 'yojo' }, revision: view.game!.revision }), undefined);
    await sockets[1].until(latest => latest.game!.players[0].hand.length === (drawer === 0 ? 2 : 1));
    await b.close();
});

test('a player whose instance died without a word is noticed by the others', async () => {
    const served = await serve();
    const host = (await served.call<Seated>('/rooms', { rules, name: 'ほすと' })).data, { id } = host.view;
    const guest = (await served.call<Seated>(`/rooms/${id}/join`, { name: 'げすと' })).data;
    const socket = await connect(served, id, guest.token);
    await socket.until(view => view.players[1]!.online);
    assert.equal(socket.latest().players[0].online, false);
    // The host's socket is on an instance that stops refreshing it: it counts for a while, then lapses.
    await served.backend.enter({ id, seat: 0, member: 'dead-pod:1' }, 400);
    await socket.until(view => view.players[0].online);
    await socket.until(view => !view.players[0].online);
    await served.close();
});

test('unattended: a host gone before the match closes the room, a guest gone loses the seat, an abandoned match closes', async () => {
    const grace = 0.4 / 60; // minutes
    const served = await serve({ lobbyGraceMinutes: grace, abandonMinutes: grace });
    // Made and never opened: closed once the grace is over.
    const lonely = (await served.call<Seated>('/rooms', { rules })).data.view.id;
    await new Promise(resolve => setTimeout(resolve, 800));
    assert.equal((await served.call<RoomInfo>(`/rooms/${lonely}`)).data.open, false);

    // The guest goes away before the match: the host keeps the room, and the seat is free again.
    const { id, sockets: [host, guest] } = await seatedRoom(served);
    await guest.close();
    const freed = await host.until(view => view.players[1] === null);
    assert.equal(freed.status, 'lobby');
    assert.equal((await served.call<RoomInfo>(`/rooms/${id}`)).data.open, true);
    // A host who comes back in time keeps it; one who does not, loses it.
    await host.close();
    await new Promise(resolve => setTimeout(resolve, 800));
    assert.equal((await served.call(`/rooms/${id}/join`, {})).status, 410);

    // Both players leave a match: it closes.
    const match = await startedMatch(served);
    await Promise.all(match.sockets.map(socket => socket.close()));
    await new Promise(resolve => setTimeout(resolve, 900));
    assert.equal((await served.call(`/rooms/${match.id}/join`, {})).status, 410);
    await served.close();
});

test('making rooms is limited per address', async () => {
    const served = await serve({ roomsPerHour: 2 });
    const make = () => served.call('/rooms', { rules }, { 'x-forwarded-for': '203.0.113.9' });
    assert.equal((await make()).status, 200);
    assert.equal((await make()).status, 200);
    assert.equal((await make()).status, 429);
    assert.equal((await served.call('/rooms', { rules }, { 'x-forwarded-for': '203.0.113.10' })).status, 200);
    await served.close();
});

test('upkeep: idle rooms lapse, and one address cannot ask without end', async () => {
    const served = await serve({ requestsPerHour: 3, idleHours: 0.4 / 3600 });
    const { data } = await served.call<Seated>('/rooms', { rules }, { 'x-forwarded-for': '203.0.113.1' });
    const socket = await connect(served, data.view.id, data.token);
    await socket.until(view => view.players[0].online);
    // Nobody does anything: the room lapses and its socket is told.
    assert.equal(await socket.closed, 4404);

    const from = (address: string) => served.call(`/rooms/${data.view.id}`, undefined, { 'x-forwarded-for': address });
    assert.equal((await from('203.0.113.1')).status, 404);
    assert.equal((await from('203.0.113.1')).status, 404);
    assert.equal((await from('203.0.113.1')).status, 429);
    assert.equal((await from('203.0.113.2')).status, 404);
    // Looking at the server's state is never limited.
    assert.equal((await served.call('/stats', undefined, { 'x-forwarded-for': '203.0.113.1' })).status, 200);
    assert.equal((await served.call('/healthz')).status, 200);
    assert.equal((await served.call('/readyz')).status, 200);
    await served.close();
});
