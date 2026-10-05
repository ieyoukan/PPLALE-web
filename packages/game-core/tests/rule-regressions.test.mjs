import test from 'node:test';
import assert from 'node:assert/strict';
import { canAttack, restoreGame } from '../dist/index.js';
import { rollDie } from '../dist/core/rng.js';
import { cloneState } from '../dist/core/state.js';
import { arena, catalog, choose, draws, failure, field, hand, idsOf, optionIds, play, run } from './helpers.mjs';

test('stealing always reduces the opponent and heals the actor by X, ignoring the legacy toggle', () => {
  const s = arena({ me: { hand: ['s_22'], points: 2 }, rules: { stealHeals: false } });
  const next = play(s, hand(s)[0]);
  assert.equal(next.players[1].points, 5);
  assert.equal(next.players[0].points, 9);
  assert.equal(s.players[0].points, 2, 'the previous state is unchanged');
});

test('steal healing respects the maximum and uses X even when the opponent has less than X', () => {
  let s = arena({ me: { hand: ['s_22'], points: 10 } });
  s = play(s, hand(s)[0]);
  assert.equal(s.players[0].points, 12);
  s = arena({ me: { hand: ['s_22'], points: 2 }, foe: { points: 2 } });
  s = play(s, hand(s)[0]);
  assert.equal(s.players[1].points, 0);
  assert.equal(s.players[0].points, 9);
  assert.equal(s.winner, 0);
});

test('taunt nullifies both halves of a steal without consuming pancake protection', () => {
  let s = arena({ me: { hand: ['s_22'], points: 2 }, foe: { field: ['y_28'] } });
  s.players[1].shield = true;
  s = play(s, hand(s)[0]);
  assert.equal(s.players[0].points, 2);
  assert.equal(s.players[1].points, 12);
  assert.equal(s.players[1].shield, true);
});

test('destroying taunt first allows the following steal and its healing', () => {
  let s = arena({ me: { hand: ['s_7'], points: 2 }, foe: { field: ['y_1'] } });
  s.players[0].played.push('s_6');
  s = choose(play(s, hand(s)[0]), field(s, 1)[0]);
  assert.equal(field(s, 1).length, 0);
  assert.equal(s.players[1].points, 11);
  assert.equal(s.players[0].points, 3);
});

test('Jonko stops selected damage, emits an isolated animation event, and the extra draw still resolves', () => {
  let s = arena({ me: { hand: ['s_6'] }, foe: { field: ['y_28', 'y_9'] } });
  s.players[0].played.push('s_7');
  const jonko = field(s, 1)[0], ordinary = field(s, 1)[1];
  s = play(s, hand(s)[0]);
  assert.deepEqual(optionIds(s), [jonko]);
  assert.ok(failure(s, { type: 'choose', actor: 0, option: ordinary }));
  s = choose(s, jonko);
  assert.equal(s.cards[jonko].damage, 0);
  assert.deepEqual(s.effectBlocks, { revision: s.revision, events: [{ uid: jonko, kind: 'damage' }] });
  const copy = cloneState(s);
  copy.effectBlocks.events[0].kind = 'destroy';
  assert.equal(s.effectBlocks.events[0].kind, 'damage');
  s = draws(s, 'yojo');
  assert.equal(hand(s).length, 1);
  assert.ok(s.effectBlocks.revision < s.revision, 'the old animation must not replay on the draw');
});

test('restoring an attack-only-taunt save updates its pending targets and removes the old heal toggle', () => {
  let s = arena({ me: { hand: ['s_6'] }, foe: { field: ['y_28', 'y_9'] } });
  s = play(s, hand(s)[0]);
  const saved = JSON.parse(JSON.stringify(s));
  delete saved.effectTauntRules;
  saved.attackOnlyTaunt = true;
  saved.rules.stealHeals = false;
  saved.pending.task.candidates = [...field(s, 1)];
  saved.pending.options = field(s, 1).map(id => ({ id, label: catalog[s.cards[id].cardId].name }));
  s = restoreGame(saved, catalog);
  assert.ok(s);
  assert.deepEqual(optionIds(s), [field(s, 1)[0]]);
  assert.equal('stealHeals' in s.rules, false);
  assert.equal('attackOnlyTaunt' in s, false);
});

test('two guards permit either guard, while pierce can reach a non-guard or sweets', () => {
  const s = arena({ me: { field: ['y_20'] }, foe: { field: ['y_8', 'y_3', 'y_28'] } });
  const uid = field(s)[0], [a, b, ordinary] = field(s, 1);
  assert.equal(canAttack(s, 0, uid, a, catalog), true);
  assert.equal(canAttack(s, 0, uid, b, catalog), true);
  assert.equal(canAttack(s, 0, uid, ordinary, catalog), false);
  assert.equal(canAttack(s, 0, uid, 'leader', catalog), false);
  s.cards[uid].keywords.push('pierce');
  assert.equal(canAttack(s, 0, uid, ordinary, catalog), true);
  assert.equal(canAttack(s, 0, uid, 'leader', catalog), true);
});

test('taunt does not prevent a normal attack from eating sweets', () => {
  let s = arena({ me: { field: ['y_20'] }, foe: { field: ['y_28'] } });
  s = run(s, { type: 'attack', actor: 0, uid: field(s)[0], target: 'leader' });
  assert.equal(s.players[1].points, 7);
});

test('1d6 advances the random state once and returns one face from 1 through 6', () => {
  const faces = new Set();
  for (let seed = 0; seed < 100; seed++) {
    const s = arena({ seed });
    const expected = (Math.imul(s.rng, 1664525) + 1013904223) >>> 0;
    const value = rollDie(s);
    assert.equal(s.rng, expected);
    assert.ok(Number.isInteger(value) && value >= 1 && value <= 6);
    faces.add(value);
  }
  assert.equal(faces.size, 6);
});

// イチゴFAQ①-4: 同時に倒れたときは自ターン側の破壊時効果が先。
test('ゼロオレンジ and レンテ trading: the active side\'s destruction effect resolves first', () => {
  const trade = (mine, theirs) => {
    const s = arena({ me: { field: mine }, foe: { field: theirs } });
    return run(s, { type: 'attack', actor: 0, uid: field(s)[0], target: field(s, 1)[0] });
  };
  // My ゼロオレンジ attacks: its 2 damage finds nobody (レンテ is already gone), then the cat appears and stays.
  let s = trade(['y_10'], ['y_7']);
  assert.deepEqual(idsOf(s, field(s)), []);
  assert.deepEqual(idsOf(s, field(s, 1)), ['token_cat']);
  assert.equal(s.cards[field(s, 1)[0]].damage, 0);
  // My レンテ attacks: my cat appears first, then the opponent's ゼロオレンジ hits it.
  s = trade(['y_7'], ['y_10']);
  assert.deepEqual(idsOf(s, field(s)), []);
  assert.deepEqual(idsOf(s, field(s, 1)), []);
  assert.deepEqual(idsOf(s, s.players[0].nap), ['y_7', 'token_cat']);
  // With another opposing unit, ゼロオレンジ's damage lands on it instead of missing.
  s = trade(['y_10'], ['y_7', 'y_9']);
  assert.deepEqual(idsOf(s, field(s, 1)), ['token_cat']);
});
