// ルームの複数の卓：卓の増減、卓の移動、卓ごとの対戦・勝敗・CPU・送信。
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_TABLES } from '@pplale/game-core/room';
import type { Entered } from '@pplale/game-core/room';
import { catalog } from '../src/catalog.ts';
import { actPlaza, admit, createPlaza, plazaView } from '../src/plaza.ts';
import { focus, tableAt, tableCount } from '../src/tables.ts';
import { connect, deck, serve } from './helpers.ts';

const rules = { fruits: ['strawberry' as const], extendedPlayable: false };

function gathering() {
    const { room } = createPlaza('234567', { rules, plaza: { visibility: 'public' } }, { name: 'ありす' });
    const owner = room.plaza!.owner!, guest = admit(room, { name: 'ぼぶ' }).member.id, third = admit(room, { name: 'きゃろる' }).member.id;
    const as = (member: string) => (body: unknown) => actPlaza(room, member, body, catalog);
    return { room, owner, guest, third, as, everyone: new Set([owner, guest, third]) };
}

test('tables: only the owner adds and takes away tables, up to one per two people', () => {
    const { room, guest, as } = gathering();
    assert.throws(() => as(guest)({ action: 'addTable' }), /オーナーだけ/);
    const owner = as(room.plaza!.owner!);
    for (let count = 1; count < MAX_TABLES; count++) owner({ action: 'addTable' });
    assert.equal(tableCount(room), MAX_TABLES);
    assert.throws(() => owner({ action: 'addTable' }), /これ以上/);
    for (let count = MAX_TABLES; count > 1; count--) owner({ action: 'removeTable' });
    assert.equal(tableCount(room), 1);
    assert.equal(room.tables, undefined, 'a room back to one table is stored as before');
    assert.throws(() => owner({ action: 'removeTable' }), /1つ以上/);
    assert.throws(() => as(guest)({ action: 'look', table: 1 }), /その卓はありません/);
});

test('tables: each table seats its own pair and plays its own match; the room keeps who won', () => {
    const { room, owner, guest, third, as, everyone } = gathering();
    as(owner)({ action: 'addTable' });
    // The guest moves to the second table and plays the CPU there; the owner plays the third member at the first.
    as(guest)({ action: 'look', table: 1 });
    as(guest)({ action: 'sit', seat: 0 });
    as(guest)({ action: 'cpu', seat: 1, level: 'easy' });
    as(guest)({ action: 'ready', deck });
    assert.equal(room.status, 'lobby', 'the first table is untouched');
    assert.equal(tableAt(room, 1)!.status, 'playing');
    as(owner)({ action: 'sit', seat: 0 });
    as(third)({ action: 'sit', seat: 1 });
    assert.deepEqual([room.seats[0]!.member, room.seats[1]!.member], [owner, third]);
    as(owner)({ action: 'ready', deck });
    as(third)({ action: 'ready', deck });
    assert.equal(room.status, 'playing');
    assert.notEqual(room.record!.id, tableAt(room, 1)!.record!.id);

    // Each sees their own table: its seats, their seat in it and its board.
    const guests = plazaView(room, guest, everyone, catalog), owners = plazaView(room, owner, everyone, catalog);
    assert.equal(guests.plaza!.table, 1);
    assert.equal(guests.seat, 0);
    assert.equal(guests.watching, undefined);
    assert.equal(guests.players[1]!.cpu, 'easy');
    assert.equal(guests.matchId, tableAt(room, 1)!.record!.id);
    assert.equal(owners.plaza!.table, 0);
    assert.equal(owners.matchId, room.record!.id);
    assert.deepEqual(owners.plaza!.tables!.map(table => table.status), ['playing', 'playing']);
    assert.deepEqual(owners.plaza!.members.map(member => member.table), [0, 1, 0]);

    // Nobody moves away in the middle of a match.
    assert.throws(() => as(guest)({ action: 'look', table: 0 }), /対戦中は卓を移れません/);
    // A rule change waits until no table plays.
    as(owner)({ action: 'rules', rules: { ...rules, turnSeconds: 120 } });
    assert.equal(room.rules.turnSeconds, undefined);
    assert.ok(room.plaza!.nextRules);

    // The second table ends: its result is kept with its table and who sat where.
    as(guest)({ action: 'resign' });
    assert.equal(tableAt(room, 1)!.status, 'finished');
    assert.equal(room.status, 'playing');
    const [first] = room.plaza!.results!;
    assert.equal(first.table, 1);
    assert.equal(first.matchId, tableAt(room, 1)!.record!.id);
    assert.equal(first.players[0].member, guest);
    assert.equal(first.players[1].cpu, 'easy');
    assert.equal(first.winner, 1);
    assert.ok(room.plaza!.nextRules, 'the first table still plays');

    // The first table ends too: the waiting rules apply.
    as(third)({ action: 'resign' });
    assert.equal(room.plaza!.results!.length, 2);
    assert.equal(room.plaza!.results![1].winner, 0);
    assert.equal(room.rules.turnSeconds, 120);
    assert.equal(room.plaza!.nextRules, undefined);

    // Leaving a finished match's seat for another table; a person still at a table keeps it from being taken away.
    as(guest)({ action: 'look', table: 0 });
    assert.equal(tableAt(room, 1)!.seats[0], null);
    assert.equal(tableAt(room, 1)!.status, 'lobby');
    assert.equal(plazaView(room, guest, everyone, catalog).plaza!.table, 0);
    as(third)({ action: 'look', table: 1 });
    as(third)({ action: 'sit', seat: 0 });
    assert.throws(() => as(owner)({ action: 'removeTable' }), /人が座っている/);
    as(third)({ action: 'stand' });
    as(owner)({ action: 'removeTable' });
    assert.equal(tableCount(room), 1);
    assert.equal(plazaView(room, third, everyone, catalog).plaza!.table, 0, 'who looked at a table taken away looks at the last one left');
});

test('tables: an aborted CPU match leaves no result, and a member leaving gives up their match at their own table', () => {
    const { room, owner, guest, as } = gathering();
    as(owner)({ action: 'addTable' });
    as(guest)({ action: 'look', table: 1 });
    as(guest)({ action: 'sit', seat: 0 });
    as(guest)({ action: 'cpu', seat: 1, level: 'easy' });
    as(guest)({ action: 'ready', deck });
    as(guest)({ action: 'abort', match: tableAt(room, 1)!.match });
    assert.equal(room.plaza!.results, undefined);
    as(guest)({ action: 'ready', deck });
    as(guest)({ action: 'leave' });
    assert.equal(tableAt(room, 1)!.status, 'finished');
    assert.equal(room.plaza!.results![0].winner, 1);
    assert.equal(focus(room, 1).seats[0]!.left, true);
});

test('tables: a CPU plays at the second table on its own, and a move there is not sent to those at the first', async () => {
    const served = await serve();
    const made = (await served.call<Entered>('/rooms', { rules, name: 'ありす', plaza: { name: 'たいかい', visibility: 'public' } })).data;
    const id = made.view.id, alice = await connect(served, id, made.token);
    await alice.until(view => view.plaza!.members[0].online);
    const joined = (await served.call<Entered>(`/rooms/${id}/join`, { name: 'ぼぶ' })).data;
    const bob = await connect(served, id, joined.token);
    await bob.until(view => view.plaza!.members.every(member => member.online));
    assert.equal(await alice.act({ action: 'addTable' }), undefined);
    assert.equal(await bob.act({ action: 'look', table: 1 }), undefined);
    await bob.until(view => view.plaza!.table === 1);
    assert.equal(await bob.act({ action: 'cpu', seat: 1, level: 'easy' }), undefined);
    assert.equal(await bob.act({ action: 'sit', seat: 0 }), undefined);
    await alice.until(view => view.plaza!.tables![1].players[0]?.name === 'ぼぶ');
    const seen = alice.views.length;
    assert.equal(await bob.act({ action: 'ready', deck }), undefined);
    await bob.until(view => view.status === 'playing');
    // Bob plays the dice and the opening at his table; the CPU answers there by itself.
    const command = (sent: object) => bob.act({ action: 'command', command: { ...sent, actor: 0 } as never, revision: bob.latest().game!.revision });
    for (let round = 0; round < 6 && bob.latest().game!.phase === 'dice'; round++) {
        assert.equal(await command({ type: 'roll' }), undefined);
        await bob.until(view => view.game!.phase !== 'dice' || view.game!.dice!.rolls[1] !== null);
    }
    if (bob.latest().game!.phase === 'initiative' && bob.latest().game!.active === 0) await command({ type: 'initiative', order: 'first' });
    await bob.until(view => view.game!.phase !== 'initiative' && view.game!.openingRemaining[1] === 0);
    // Alice, at the first table, was told the second one started (its look from outside changed), not of every move.
    await alice.until(view => view.plaza!.tables![1].status === 'playing');
    assert.equal(alice.latest().status, 'lobby');
    assert.equal(alice.latest().game, null);
    assert.ok(alice.views.length - seen <= 2, `the first table got ${alice.views.length - seen} views`);
    await served.close();
});
