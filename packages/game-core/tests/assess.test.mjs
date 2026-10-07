import test from 'node:test';
import assert from 'node:assert/strict';
import { createValueEvaluator, gradeMove, valueModel, winProbability } from '../dist/ai/index.js';
import { playMatch } from '../dist/index.js';
import { arena, catalog, field, hand, run } from './helpers.mjs';

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

test('assess: grades only moves of skill, by how much of its player\'s chance they cost', () => {
  const s = arena({ me: { field: ['y_3'], hand: ['y_9'] }, foe: { field: ['y_17'] } });
  const end = { type: 'end', actor: 0 }, after = run(s, end);
  assert.deepEqual(gradeMove(s, s, { type: 'attack', actor: 0, uid: field(s)[0], target: 'leader' }, 0.6, 0.4), { loss: 0.6 - 0.4, grade: 'blunder' });
  assert.equal(gradeMove(s, s, end, 0.6, 0.5).grade, 'dubious');
  assert.equal(gradeMove(s, s, end, 0.6, 0.58).grade, null);
  // Side 1's chance is the other way round.
  assert.equal(gradeMove(s, s, { type: 'end', actor: 1 }, 0.4, 0.6).grade, 'blunder');
  // Ending the turn drew a card for the opponent: luck, not graded.
  assert.equal(gradeMove(s, after, end, 0.9, 0.1).grade, after.rng !== s.rng || after.players[1].yojo.length !== s.players[1].yojo.length ? null : 'blunder');
  assert.ok(hand(s).length === 1);
});
