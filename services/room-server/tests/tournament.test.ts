// ルームのトーナメント：抽選、不戦勝、卓への呼び出し、勝者の記入、手での決着、優勝。
import test from 'node:test';
import assert from 'node:assert/strict';
import { championOf, matchPlayers, matchState, newTournament, roundName } from '@pplale/game-core/room';
import type { PlazaTournament } from '@pplale/game-core/room';
import { catalog } from '../src/catalog.ts';
import { actPlaza, admit, createPlaza, plazaView, placeOf } from '../src/plaza.ts';
import { tableAt, tableCount } from '../src/tables.ts';
import { deck } from './helpers.ts';

const rules = { fruits: ['strawberry' as const], extendedPlayable: false };

function gathering(count: number) {
    const { room } = createPlaza('345612', { rules, plaza: { visibility: 'public' } }, { name: 'p0' });
    const ids = [room.plaza!.owner!, ...Array.from({ length: count - 1 }, (_, at) => admit(room, { name: `p${at + 1}` }).member.id)];
    const as = (member: string) => (body: unknown) => actPlaza(room, member, body, catalog);
    return { room, ids, owner: as(ids[0]), as };
}
const memberAt = (tournament: PlazaTournament, entrant: number | null) => entrant === null ? null : tournament.entrants[entrant]!.member;

test('tournament: the bracket gives byes to separate first matches and names its rounds', () => {
    const entrants = Array.from({ length: 5 }, (_, at) => ({ member: `m${at}`, name: `p${at}` }));
    const bracket = newTournament('t', entrants);
    assert.equal(bracket.entrants.length, 8);
    assert.deepEqual(bracket.rounds.map(round => round.length), [4, 2, 1]);
    assert.deepEqual(bracket.rounds[0].map(match => match.winner), [0, 0, 0, null]);
    assert.deepEqual(matchPlayers(bracket, 1, 0), [0, 2], 'two byes meet in the second round');
    assert.equal(matchState(bracket, 1, 0), 'ready');
    assert.equal(matchState(bracket, 1, 1), 'waiting');
    assert.deepEqual([0, 1, 2].map(round => roundName(bracket, round)), ['1回戦', '準決勝', '決勝']);
    assert.equal(championOf(bracket), null);
});

test('tournament: matches are called to free tables, results move winners on, and the last one standing wins', () => {
    const { room, ids, owner, as } = gathering(4);
    assert.throws(() => as(ids[1])({ action: 'tournament', entrants: ids }), /オーナーだけ/);
    assert.throws(() => owner({ action: 'tournament', entrants: [ids[0], 'nobody'] }), /2人以上/);
    owner({ action: 'tournament', entrants: ids });
    const tournament = () => room.plaza!.tournament!;
    // Both first-round matches are called at once: a table each, the upper player in seat 0.
    assert.equal(tableCount(room), 2);
    for (const index of [0, 1]) {
        const match = tournament().rounds[0][index], seats = tableAt(room, match.table!)!.seats;
        assert.deepEqual(seats.map(seat => seat!.member), matchPlayers(tournament(), 0, index).map(entrant => memberAt(tournament(), entrant)));
        assert.equal(matchState(tournament(), 0, index), 'playing');
    }
    const view = plazaView(room, ids[1], new Set(ids), catalog);
    assert.equal(view.plaza!.tournament!.id, tournament().id);
    assert.equal(view.plaza!.table, placeOf(room, ids[1])!.table, 'each player is taken to their own table');

    // Table by table: both get ready, the lower one resigns.
    const play = (index: number) => {
        const [upper, lower] = matchPlayers(tournament(), 0, index).map(entrant => memberAt(tournament(), entrant)!);
        as(upper)({ action: 'ready', deck });
        as(lower)({ action: 'ready', deck });
        as(lower)({ action: 'resign' });
        return [upper, lower];
    };
    const [first, firstLoser] = play(0);
    assert.equal(tournament().rounds[0][0].winner, 0);
    assert.ok(tournament().rounds[0][0].matchId);
    assert.equal(tournament().rounds[0][0].table, undefined);
    const [second] = play(1);
    // The final is ready, but its players are still looking at their results: not called yet.
    assert.equal(matchState(tournament(), 1, 0), 'ready');
    as(first)({ action: 'stand' });
    assert.equal(matchState(tournament(), 1, 0), 'ready');
    as(second)({ action: 'stand' });
    assert.equal(matchState(tournament(), 1, 0), 'playing');
    const final = tableAt(room, tournament().rounds[1][0].table!)!;
    assert.deepEqual(final.seats.map(seat => seat!.member), [first, second]);
    assert.notEqual(placeOf(room, firstLoser)?.table, tournament().rounds[1][0].table);

    // The owner cannot call or decide a match already being played.
    as(first)({ action: 'ready', deck });
    as(second)({ action: 'ready', deck });
    assert.throws(() => owner({ action: 'callMatch', round: 1, index: 0 }), /もう始まっています/);
    assert.throws(() => owner({ action: 'decide', round: 1, index: 0, winner: 0 }), /もう始まっています/);
    as(first)({ action: 'resign' });
    assert.equal(memberAt(tournament(), championOf(tournament())), second);
    owner({ action: 'endTournament' });
    assert.equal(room.plaza!.tournament, undefined);
});

test('tournament: the owner decides a match nobody plays, and calls again one whose players left their seats', () => {
    const { room, ids, owner, as } = gathering(3);
    owner({ action: 'tournament', entrants: ids });
    const tournament = room.plaza!.tournament!;
    // Three: one bye; the other first match is called.
    const called = tournament.rounds[0].findIndex(match => match.table !== undefined);
    assert.notEqual(called, -1);
    const [upper, lower] = matchPlayers(tournament, 0, called).map(entrant => memberAt(tournament, entrant)!);
    // They walk away: the match keeps its table until the owner calls it again.
    as(upper)({ action: 'stand' });
    as(lower)({ action: 'stand' });
    assert.equal(matchState(tournament, 0, called), 'playing');
    owner({ action: 'callMatch', round: 0, index: called });
    assert.deepEqual(tableAt(room, tournament.rounds[0][called].table!)!.seats.map(seat => seat!.member), [upper, lower]);
    // Someone cannot play: the owner gives the match to the other.
    owner({ action: 'decide', round: 0, index: called, winner: 1 });
    assert.equal(memberAt(tournament, matchPlayers(tournament, 1, 0)[called === 0 ? 0 : 1]), lower);
    // The final is called at once (its players were free).
    assert.equal(matchState(tournament, 1, 0), 'playing');
    assert.throws(() => owner({ action: 'decide', round: 0, index: called, winner: 0 }), /もう終わりました/);
});

test('tournament: a match the owner decides frees its table, and the next match is called there', () => {
    const { room, ids, owner } = gathering(4);
    owner({ action: 'tournament', entrants: ids });
    const tournament = room.plaza!.tournament!;
    owner({ action: 'decide', round: 0, index: 0, winner: 0 });
    owner({ action: 'decide', round: 0, index: 1, winner: 1 });
    // Two tables were enough: the final went to one the semifinals left.
    assert.equal(tableCount(room), 2);
    assert.equal(matchState(tournament, 1, 0), 'playing');
    const final = tableAt(room, tournament.rounds[1][0].table!)!;
    assert.deepEqual(final.seats.map(seat => seat!.member), matchPlayers(tournament, 1, 0).map(entrant => memberAt(tournament, entrant)));
});
