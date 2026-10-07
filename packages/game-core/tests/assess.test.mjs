import test from 'node:test';
import assert from 'node:assert/strict';
import { BLUNDER, DUBIOUS, createValueEvaluator, gradeOf, moveLoss, valueModel, winProbability } from '../dist/ai/index.js';
import { playMatch } from '../dist/index.js';
import { arena, catalog, field, hand } from './helpers.mjs';

const evaluate = createValueEvaluator(valueModel);
const win = (s, options) => winProbability(s, catalog, evaluate, valueModel.scale, options);

test('assess: a finished match is certain, and a sure win this turn counts as one', () => {
  const s = arena({ me: { field: ['y_3'] }, foe: { points: 1 } });
  assert.equal(win(s), 1);
  s.winner = 1;
  assert.equal(win(s), 0);
});

test('assess: what the viewer cannot see does not change its judgement', () => {
  const s = arena({ me: { field: ['y_3'], hand: ['y_9'] }, foe: { field: ['y_17'], hand: ['y_9', 's_6'], yojo: ['y_20', 'y_25'] } });
  const swapped = structuredClone(s), foe = swapped.players[1];
  // The opponent's hidden ぷらむ and the top of its deck trade places: side 0 cannot tell.
  const [inHand, inDeck] = [foe.hand[0], foe.yojo[0]];
  foe.hand[0] = inDeck;
  foe.yojo[0] = inHand;
  for (const seed of [1, 2, 3]) assert.equal(win(s, { viewer: 0, seed }), win(swapped, { viewer: 0, seed }));
});

test('assess: the other player\'s choice in the middle of a turn is resolved before judging', () => {
  // A real match where side 1 has to take its threshold draw during side 0's turn.
  const states = [];
  playMatch(catalog, { levels: ['hard', 'hard'], seed: 5, onStep: s => states.push(s) });
  const mid = states.find(s => s.pending && s.pending.task.actor !== s.active && s.winner === null);
  assert.ok(mid, 'the match has such a moment');
  const p = win(mid, { viewer: 0 });
  assert.ok(p > 0 && p < 1 || p === 1 || p === 0);
  assert.ok(Number.isFinite(p));
});

test('assess: a move is judged against the best plan from the same position', () => {
  // ゼロオレンジ can eat the last sweet point: ending the turn instead throws the win away.
  const s = arena({ me: { field: ['y_10'] }, foe: { points: 2 } });
  const attack = { type: 'attack', actor: 0, uid: field(s)[0], target: 'leader' };
  assert.equal(moveLoss(s, attack, catalog, evaluate, valueModel.scale), 0);
  assert.ok(moveLoss(s, { type: 'end', actor: 0 }, catalog, evaluate, valueModel.scale) >= BLUNDER);
  assert.equal(gradeOf(BLUNDER), 'blunder');
  assert.equal(gradeOf(DUBIOUS), 'dubious');
  assert.equal(gradeOf(0.01), null);
  // Not this side's decision: nothing to judge.
  assert.equal(moveLoss(s, { type: 'end', actor: 1 }, catalog, evaluate, valueModel.scale), null);
  assert.ok(hand(s).length === 0);
});
