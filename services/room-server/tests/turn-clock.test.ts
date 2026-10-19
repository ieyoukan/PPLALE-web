import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPosition } from '@pplale/game-core';
import type { PositionSide } from '@pplale/game-core';
import { describeRoomRules, parseRoomRules } from '@pplale/game-core/room';
import { catalog } from '../src/catalog.ts';
import { act, createRoom, expireTurn, joinRoom, seatView } from '../src/rooms.ts';
import { syncTurnClock, turnTimeoutCommand } from '../src/turn-clock.ts';
import { connect, serve, shared } from './helpers.ts';

const side = (overrides: Partial<PositionSide> = {}): PositionSide => ({
    playable: 'p_1', points: 15, maxPoints: 15, turns: 3, maxPp: 3, pp: 3,
    field: [], hand: [], nap: [], yojo: ['y_8', 'y_8'], sweet: ['s_1'], ...overrides,
});
function fixture(seconds: 120 | 180 | 300 | undefined = 120, me: Partial<PositionSide> = {}, foe: Partial<PositionSide> = {}) {
    const made = createRoom('123456', { rules: { fruits: ['strawberry', 'grape', 'orange'], turnSeconds: seconds } });
    const guest = joinRoom(made.room, {}), room = made.room;
    room.status = 'playing';
    room.match = 1;
    room.state = buildPosition({ version: 1, active: 0, first: 0, players: [side(me), side(foe)] }, catalog);
    syncTurnClock(room, 1000);
    return { room, host: made.token, guest };
}
const send = (room: ReturnType<typeof fixture>['room'], actor: 0 | 1, command: object, now: number) =>
    act(room, actor, { action: 'command', revision: room.state!.revision, command: { ...command, actor } }, catalog, now);

test('turn limits: whitelist the three durations; unlimited and legacy rooms stay unlimited', () => {
    for (const seconds of [120, 180, 300]) {
        const rules = parseRoomRules({ fruits: ['strawberry'], turnSeconds: seconds })!;
        assert.equal(rules.turnSeconds, seconds);
        assert.ok(describeRoomRules(rules).includes(`${seconds / 60}分`));
    }
    for (const seconds of [undefined, null, 0, 1, -1, 121, 1e20, '120', {}]) {
        const rules = parseRoomRules({ fruits: ['strawberry'], turnSeconds: seconds })!;
        assert.equal(rules.turnSeconds, undefined);
        assert.match(describeRoomRules(rules), /無制限/);
    }
    const { room } = fixture();
    delete room.rules.turnSeconds;
    syncTurnClock(room, 1000);
    assert.equal(room.turnClock, undefined);
    assert.equal(expireTurn(room, catalog, 1e10), null);
});

test('the clock starts with play, not during dice, opening draws or mulligans', () => {
    const { room } = fixture();
    for (const phase of ['dice', 'initiative', 'opening', 'mulligan'] as const) {
        room.state!.phase = phase;
        syncTurnClock(room, 5000);
        assert.equal(room.turnClock, undefined);
    }
    room.state!.phase = 'playing';
    syncTurnClock(room, 20_000);
    assert.equal(room.turnClock!.remainingMs, 120_000);
    assert.equal(room.turnClock!.deadline, 140_000);
});

test('only the opponent’s choice freezes the clock; repeated updates and restore do not refill it', () => {
    let { room } = fixture(180);
    const state = room.state!;
    state.pending = { task: { op: 'draw', actor: 0 }, prompt: '', options: [{ id: 'yojo', label: '' }] };
    syncTurnClock(room, 61_000);
    assert.equal(room.turnClock!.deadline, 181_000);
    assert.equal(room.turnClock!.remainingMs, 120_000);
    state.pending.task.actor = 1;
    syncTurnClock(room, 71_000);
    assert.equal(room.turnClock!.deadline, null);
    assert.equal(room.turnClock!.remainingMs, 110_000);
    room = structuredClone(room);
    syncTurnClock(room, 900_000);
    assert.equal(room.turnClock!.remainingMs, 110_000);
    assert.equal(turnTimeoutCommand(room, 900_000), null);
    room.state!.pending = null;
    syncTurnClock(room, 1_000_000);
    assert.equal(room.turnClock!.deadline, 1_110_000);
    syncTurnClock(room, 1_010_000);
    assert.equal(room.turnClock!.deadline, 1_110_000);
    const view = seatView(room, 0, { online: [true, true], watching: 0 });
    assert.deepEqual(view.turnClock, room.turnClock);
    assert.equal(typeof view.serverNow, 'number');
});

test('an actual リンネ hand reaction pauses, then resumes exactly the time left', () => {
    const { room } = fixture(120, { field: [{ id: 'y_49' }] }, { field: [{ id: 'y_8' }], hand: ['y_33'] });
    const [attacker] = room.state!.players[0].field, [target] = room.state!.players[1].field;
    send(room, 0, { type: 'attack', uid: attacker, target }, 31_000);
    assert.equal(room.state!.pending!.task.op, 'attackResponses');
    assert.equal(room.state!.pending!.task.actor, 1);
    assert.equal(room.turnClock!.deadline, null);
    assert.equal(room.turnClock!.remainingMs, 90_000);
    assert.equal(expireTurn(room, catalog, 5_000_000), null);
    send(room, 1, { type: 'choose', option: 'skip' }, 5_000_000);
    assert.equal(room.turnClock!.deadline, 5_090_000);
    assert.equal(room.turnClock!.remainingMs, 90_000);
});

test('timeout completes mandatory own choices, ends the turn and gives the next side its full time', () => {
    const { room } = fixture(300);
    room.state!.pending = { task: { op: 'draw', actor: 0 }, prompt: '', options: [{ id: 'yojo', label: '' }, { id: 'sweet', label: '' }] };
    const before = room.state!.turn;
    assert.equal(expireTurn(room, catalog, 300_999), null);
    assert.throws(() => send(room, 0, { type: 'choose', option: 'sweet' }, 301_000), /制限時間/);
    assert.equal(expireTurn(room, catalog, 301_000)?.command, true);
    assert.equal(room.last!.command.type, 'choose');
    assert.equal(room.state!.players[0].hand.length, 1);
    assert.equal(room.turnClock!.deadline, 301_000);
    expireTurn(room, catalog, 301_001);
    assert.equal(room.last!.command.type, 'end');
    assert.equal(room.state!.active, 1);
    assert.equal(room.state!.turn, before + 1);
    assert.equal(room.turnClock!.deadline, 601_001);
    assert.equal(room.turnClock!.expired, undefined);
    assert.equal(room.state!.log.filter(line => line.includes('制限時間になりました')).length, 1);
    assert.equal(expireTurn(room, catalog, 301_002), null);
});

test('timeout respects hand-limit exclusions and optional choice completion', () => {
    const { room } = fixture(120, { hand: Array.from({ length: 11 }, () => 'y_8') });
    const turn = room.state!.turn;
    let steps = 0;
    while (room.state!.turn === turn && steps++ < 10) assert.ok(expireTurn(room, catalog, 121_000 + steps));
    assert.equal(room.state!.players[0].hand.length, 9);
    assert.equal(room.state!.players[0].exile.length, 2);
    assert.equal(room.state!.turn, turn + 1);
    const { room: optional } = fixture();
    optional.state!.pending = { task: { op: 'cardEffect', actor: 0 }, prompt: '', options: [{ id: 'secret-card', label: '' }, { id: 'done', label: '' }] };
    assert.deepEqual(turnTimeoutCommand(optional, 121_000), { type: 'choose', actor: 0, option: 'done' });
});

test('a zero-time turn can still pause for the opponent, then automatically finish; resign/rematch clear the clock', () => {
    const { room } = fixture();
    room.turnClock!.deadline = 1000;
    room.state!.pending = { task: { op: 'attackResponses', actor: 1 }, prompt: '', options: [{ id: 'skip', label: '' }] };
    syncTurnClock(room, 2000);
    assert.equal(room.turnClock!.remainingMs, 0);
    assert.equal(expireTurn(room, catalog, 1e9), null);
    room.state!.pending = null;
    syncTurnClock(room, 1e9);
    assert.ok(expireTurn(room, catalog, 1e9));
    assert.equal(room.state!.active, 1);
    act(room, 0, { action: 'resign' }, catalog, 1e9 + 1);
    assert.equal(room.turnClock, undefined);
    act(room, 0, { action: 'rematch' }, catalog, 1e9 + 2);
    assert.equal(room.turnClock, undefined);
    assert.equal(room.rules.turnSeconds, 120);
});

test('two instances automatically commit a deadline once and send the same clock to both browsers', { timeout: 10_000 }, async t => {
    const data = shared(), a = await serve({ data, beatSeconds: 60 }), b = await serve({ data, beatSeconds: 60 });
    t.after(async () => { await b.close(); await a.close(); });
    const { room, host, guest } = fixture();
    room.turnClock!.deadline = Date.now() + 500;
    await a.backend.create(room, 60_000);
    const one = await connect(a, room.id, host), two = await connect(b, room.id, guest);
    const turn = room.state!.turn;
    const views = await Promise.all([one.until(view => view.game!.turn > turn), two.until(view => view.game!.turn > turn)]);
    assert.deepEqual(views[0].turnClock, views[1].turnClock);
    assert.equal(views[0].game!.turn, turn + 1);
    assert.equal(views[0].last!.command.type, 'end');
    assert.equal((await a.backend.get(room.id))!.state!.revision, room.state!.revision + 1);
    const again = await connect(a, room.id, host);
    const resumed = await again.until(() => true);
    assert.equal(resumed.turnClock!.deadline, views[0].turnClock!.deadline);
});

test('a replacement server recovers an overdue clock with no connected browser', { timeout: 10_000 }, async t => {
    const data = shared(), backend = await data.open();
    const { room } = fixture();
    room.turnClock!.deadline = Date.now() - 1000;
    await backend.create(room, 60_000);
    const served = await serve({ data, beatSeconds: 60 });
    t.after(async () => { await served.close(); await backend.close(); });
    // Starting/beat discovers persisted clocks; the deadline does not depend on a socket or client timer.
    let updated = await backend.get(room.id);
    for (let tries = 0; tries < 100 && updated!.state!.turn === room.state!.turn; tries++) {
        await new Promise(resolve => setTimeout(resolve, 10));
        updated = await backend.get(room.id);
    }
    assert.equal(updated!.state!.turn, room.state!.turn + 1);
});
