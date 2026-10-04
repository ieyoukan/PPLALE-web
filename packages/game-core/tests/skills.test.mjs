import test from 'node:test';
import assert from 'node:assert/strict';
import { arena, choose, draws, failure, field, hand, idsOf, run, skill, stats } from './helpers.mjs';

const end = s => run(s, { type: 'end', actor: s.active });

test('common skill 突撃！隣のおやつタイム: grants charge, needs a unit, and has two uses', () => {
  let s = arena({ me: { hand: ['y_9'] } });
  assert.match(failure(s, { type: 'skill', actor: 0, index: 0 }), /場/);
  s = arena({ me: { field: ['y_9'] } });
  s = choose(skill(s, 0), field(s)[0]);
  assert.ok(s.cards[field(s)[0]].keywords.includes('charge'));
  s = choose(skill(s, 0), field(s)[0]);
  assert.deepEqual(s.cards[field(s)[0]].keywords, ['charge']);
  assert.match(failure(s, { type: 'skill', actor: 0, index: 0 }), /残り回数/);
});

test('skills check and spend PP', () => {
  const s = arena({ me: { playable: 'p_0', pp: 2 } });
  assert.match(failure(s, { type: 'skill', actor: 0, index: 1 }), /PP/);
});

test('p_0 あみの: 参謀 adds max PP and a temporary -2 on a sweet; バックアップ needs max PP 7', () => {
  let s = arena({ me: { playable: 'p_0', hand: ['s_22'], ppBonus: 2 } });
  const sweet = hand(s)[0];
  s = choose(skill(s, 1), sweet);
  assert.equal(s.players[0].ppBonus, 3);
  assert.equal(s.cards[sweet].temporaryCost, -2);
  assert.match(failure(s, { type: 'skill', actor: 0, index: 2 }), /7/);
  s = draws(end(s));
  assert.equal(s.cards[sweet].temporaryCost, 0);
  s = arena({ me: { playable: 'p_0' }, foe: { field: ['y_23'] } });
  s = draws(skill(s, 2));
  assert.equal(s.players[0].ppBonus, 9);
  assert.equal(s.cards[field(s, 1)[0]].damage, 2);
  assert.equal(hand(s).length, 1);
});

test('p_1 うぃまる: 1 / 2 damage, and the third may pay 1 more PP for 2', () => {
  for (const [index, damage] of [[1, 1], [2, 2]]) {
    let s = arena({ me: { playable: 'p_1' }, foe: { field: ['y_23'] } });
    s = choose(skill(s, index), field(s, 1)[0]);
    assert.equal(s.cards[field(s, 1)[0]].damage, damage);
  }
  let s = arena({ me: { playable: 'p_1', pp: 2 }, foe: { field: ['y_23'] } });
  s = choose(skill(s, 3), 'yes');
  s = choose(s, field(s, 1)[0]);
  assert.equal(s.players[0].pp, 0);
  assert.equal(s.cards[field(s, 1)[0]].damage, 2);
});

test('p_2 ストラ: borrows 2 PP from the next turn and cannot borrow on consecutive turns', () => {
  let s = arena({ me: { playable: 'p_2', pp: 1, ppBonus: 0 } });
  s = skill(s, 1);
  assert.equal(s.players[0].pp, 3);
  s = draws(end(draws(end(s))));
  assert.equal(s.players[0].pp, s.players[0].turns + s.players[0].ppBonus - 2);
  assert.match(failure(s, { type: 'skill', actor: 0, index: 1 }), /連続/);
  s = draws(end(draws(end(s))));
  assert.equal(failure(s, { type: 'skill', actor: 0, index: 1 }), undefined);
});

test('p_3 ももか: 応急手当 refunds a common use, 買ってきた gives guard, 元気 raises the maximum', () => {
  let s = arena({ me: { playable: 'p_3', points: 5, field: ['y_9'] } });
  s = skill(s, 1);
  assert.equal(s.players[0].points, 6);
  assert.equal(s.players[0].skills[0], 3);
  s = skill(s, 2);
  assert.equal(s.players[0].points, 7);
  assert.deepEqual(s.cards[field(s)[0]].keywords, ['guard']);
  s = skill(s, 3);
  assert.equal(s.players[0].maxPoints, 15);
  assert.equal(s.players[0].points, 10);
});

test('p_4 りくす: leadership is +2/+2 with two or fewer units; punishment can pay 2 more for all', () => {
  let s = arena({ me: { playable: 'p_4', field: ['y_9', 'y_9'] } });
  s = skill(s, 1);
  assert.deepEqual(field(s).map(uid => stats(s, uid)), [[3, 4], [3, 4]]);
  s = arena({ me: { playable: 'p_4', field: ['y_9', 'y_9', 'y_9'] } });
  s = skill(s, 1);
  assert.deepEqual(stats(s, field(s)[0]), [2, 3]);
  s = arena({ me: { playable: 'p_4' }, foe: { field: ['y_20', 'y_20', 'y_17'] } });
  for (const uid of field(s, 1).slice(0, 2)) s.cards[uid].ateOn = s.turn - 1;
  s = choose(skill(s, 2), 'all');
  assert.deepEqual(idsOf(s, field(s, 1)), ['y_17']);
  assert.equal(s.players[0].pp, 7);
});

test('p_5 レンテ: pays 2 points to take an enemy unit with its stat changes; or draws 2 yojo', () => {
  let s = arena({ me: { playable: 'p_5', points: 8 }, foe: { field: ['y_23'] } });
  const target = field(s, 1)[0];
  s.cards[target].attackBonus = 2;
  s = choose(skill(s, 1), target);
  assert.equal(s.players[0].points, 6);
  assert.deepEqual(field(s), [target]);
  assert.deepEqual(stats(s, target), [5, 4]);
  s = arena({ me: { playable: 'p_5' } });
  s = skill(s, 2);
  assert.deepEqual(s.pending.options.map(o => o.id), ['yojo']);
  s = draws(s);
  assert.deepEqual(idsOf(s, hand(s)), ['y_17', 'y_17']);
});

test('skills that select a unit cannot be used when there is none to select', () => {
  const blocked = (playable, index, foe = {}) => {
    const s = arena({ me: { playable }, foe });
    return failure(s, { type: 'skill', actor: 0, index });
  };
  // うぃまる: every skill targets one enemy unit.
  for (const index of [1, 2, 3]) assert.match(blocked('p_1', index), /幼女がいません/);
  // レンテ: nobody to take.
  assert.match(blocked('p_5', 1), /幼女がいません/);
  // りくす: an enemy is there, but none ate sweets last turn.
  assert.match(blocked('p_4', 2, { field: ['y_9'] }), /食べた幼女がいません/);
  // Nothing was spent.
  const s = arena({ me: { playable: 'p_1' } });
  applyCommandFails(s);
});

function applyCommandFails(s) {
  const before = { pp: s.players[0].pp, uses: [...s.players[0].skills] };
  assert.ok(failure(s, { type: 'skill', actor: 0, index: 1 }));
  assert.deepEqual({ pp: s.players[0].pp, uses: [...s.players[0].skills] }, before);
}
