import test from 'node:test';
import assert from 'node:assert/strict';
import { availablePpMaximum, maxPp, newGame, restoreGame, sandboxRules } from '../dist/index.js';
import { arena, catalog, choose, draws, failure, hand, run } from './helpers.mjs';

const end = s => run(s, { type: 'end', actor: s.active });

test('both players draw on their first turn, including the first player after mulligan', () => {
  const deck = { name: 'テスト', yojo: Array(20).fill('y_2'), sweet: Array(10).fill('s_19'), playable: 'p_0' };
  let s = newGame([deck, deck], catalog, sandboxRules, 42);
  while (s.phase === 'dice') s = run(s, { type: 'roll', actor: !s.dice || s.dice.rolls[0] === null || s.dice.rolls[1] !== null ? 0 : 1 });
  s = run(s, { type: 'initiative', actor: s.active, order: 'first' });
  while (s.phase === 'opening') s = run(s, { type: 'openingDraw', actor: s.openingRemaining[0] ? 0 : 1, deck: 'yojo' });
  while (s.phase === 'mulligan') s = run(s, { type: 'keep', actor: s.active });
  const first = s.active, second = first === 0 ? 1 : 0;
  assert.equal(hand(s, first).length, 3);
  assert.equal(s.players[first].pp, 1);
  assert.equal(s.pending.task.text, 'turn');
  assert.ok(failure(s, { type: 'end', actor: first }));
  s = choose(s, 'sweet');
  assert.equal(hand(s, first).length, 4);
  s = end(s);
  assert.equal(s.active, second);
  assert.equal(s.players[second].pp, 1);
  assert.equal(hand(s, second).length, 4);
  s = choose(s, 'yojo');
  assert.equal(hand(s, second).length, 5);
});

test('PP has a fixed maximum of 12, even with permanent bonuses', () => {
  const s = arena({ me: { turns: 20, ppBonus: 30 } });
  assert.equal(maxPp(s, 0), 12);
  assert.equal(availablePpMaximum(s, 0), 12);
});

test('second player gets two usable PP only on its fifth turn, without a permanent max-PP buff', () => {
  let s = arena({ me: { turns: 4, ppBonus: 0 }, foe: { turns: 4, ppBonus: 0 } });
  s = draws(end(s));
  assert.equal(s.active, 1);
  assert.equal(s.players[1].turns, 5);
  assert.equal(s.players[1].pp, 7);
  assert.equal(s.players[1].turnPpBonus, 2);
  assert.equal(maxPp(s, 1), 5);
  assert.equal(availablePpMaximum(s, 1), 7);
  s = draws(end(s));
  assert.equal(s.players[1].pp, 0);
  assert.equal(s.players[1].turnPpBonus, 0);
  assert.equal(s.players[0].pp, 5);
  s = draws(end(s));
  assert.equal(s.players[1].turns, 6);
  assert.equal(s.players[1].pp, 6);
  assert.equal(s.players[1].turnPpBonus, 0);
});

test('fifth-turn bonus follows the actual second player when side 0 goes second', () => {
  let s = arena({ me: { turns: 4, ppBonus: 0 }, foe: { turns: 4, ppBonus: 0 }, rules: { firstPlayer: 1 } });
  s.active = 1;
  s = draws(end(s));
  assert.equal(s.players[0].pp, 7);
  assert.equal(s.players[0].turnPpBonus, 2);
});

test('ending with 11 cards waits for two chosen exclusions, not discard triggers, before passing the turn', () => {
  let s = arena({ me: { hand: Array(11).fill('y_5') } });
  s.players[1].yojo = [];
  s.players[1].sweet = [];
  const original = [...hand(s)], deckSize = s.players[0].yojo.length;
  s = end(s);
  assert.equal(s.active, 0);
  assert.equal(s.pending.task.op, 'trimHand');
  assert.ok(failure(s, { type: 'play', actor: 0, uid: original[0] }));
  s = choose(s, original[0]);
  assert.equal(hand(s).length, 10);
  assert.equal(s.active, 0);
  s = restoreGame(JSON.parse(JSON.stringify(s)), catalog);
  s = choose(s, original[1]);
  assert.equal(hand(s).length, 9);
  assert.deepEqual(s.players[0].exile, original.slice(0, 2));
  assert.equal(s.players[0].nap.length, 0);
  assert.equal(s.players[0].yojo.length, deckSize);
  assert.equal(s.active, 1);
  assert.equal(s.players[0].pp, 0);
  assert.equal(s.pending, null);
  assert.equal(s.winner, null);
});

test('nine cards need no exclusions and unspent PP is cleared', () => {
  const s = end(arena({ me: { hand: Array(9).fill('y_5'), pp: 8 } }));
  assert.equal(s.active, 1);
  assert.equal(s.players[0].pp, 0);
  assert.equal(s.pending.task.op, 'draw');
  assert.equal(s.players[0].exile.length, 0);
});

test('an empty deck cannot be chosen for the turn draw; two empty decks skip replenishment without defeat', () => {
  let s = arena();
  s.players[1].yojo = [];
  s = end(s);
  assert.deepEqual(s.pending.options.map(o => o.id), ['sweet']);
  assert.ok(failure(s, { type: 'choose', actor: 1, option: 'yojo' }));
  s = choose(s, 'sweet');
  s.players[0].yojo = [];
  s.players[0].sweet = [];
  s = end(s);
  assert.equal(s.active, 0);
  assert.equal(s.pending, null);
  assert.equal(s.winner, null);
  assert.equal(s.players[0].pp, s.players[0].turns + s.players[0].ppBonus);
});

test('10 and 5 sweet draws can each be declined once, including crossing both in a single loss', () => {
  let s = arena();
  s = run(s, { type: 'adjust', actor: 0, resource: 'points', delta: -8 }, true);
  assert.deepEqual(s.players[0].milestones, [10, 5]);
  assert.deepEqual(s.pending.options.map(o => o.id), ['sweet', 'skip']);
  s = choose(s, 'skip');
  s = choose(s, 'sweet');
  assert.equal(s.players[0].sweet.length, 9);
  s = run(s, { type: 'adjust', actor: 0, resource: 'points', delta: 8 }, true);
  s = run(s, { type: 'adjust', actor: 0, resource: 'points', delta: -8 }, true);
  assert.equal(s.pending, null);
  assert.equal(s.players[0].sweet.length, 9);
});

test('old empty-deck draw choices restore without trapping the match', () => {
  let s = end(arena());
  s.players[s.active].yojo = [];
  s.players[s.active].sweet = [];
  delete s.turnRules;
  s.rules.emptyDeckLoses = true;
  s.rules.maxPP = 10;
  s.rules.firstTurnDraw = false;
  s = restoreGame(JSON.parse(JSON.stringify(s)), catalog);
  assert.equal(s.pending, null);
  assert.equal(s.winner, null);
  assert.equal('emptyDeckLoses' in s.rules, false);
  assert.equal('maxPP' in s.rules, false);
});
