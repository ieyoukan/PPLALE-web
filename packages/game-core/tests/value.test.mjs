import test from 'node:test';
import assert from 'node:assert/strict';
import { createValueEvaluator, searchTurn, valueFeatures, valueLayout, valueLogit } from '../dist/ai/index.js';
import { legalMoves } from '../dist/index.js';
import { arena, catalog } from './helpers.mjs';

const { full, inputs } = valueLayout;
/** A fixed, arbitrary network: these tests are about the wiring, not about a trained model. */
const model = (hidden = 4) => {
  let r = 1;
  const next = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r / 4294967296 - 0.5; };
  const values = count => Array.from({ length: count }, next);
  return { inputs, hidden, first: values(inputs * hidden), bias: values(hidden), out: values(hidden), linear: values(inputs), scale: 10 };
};
const board = () => arena({ me: { field: ['y_3'], hand: ['y_15', 's_16'], points: 9 }, foe: { field: ['y_8'], hand: ['y_0'], points: 4 } });

test('value: swapping the sides negates the value', () => {
  const m = model(), features = valueFeatures(board(), catalog);
  const swapped = new Float32Array([...features.subarray(full), ...features.subarray(0, full)]);
  assert.notEqual(valueLogit(m, features), 0);
  assert.ok(Math.abs(valueLogit(m, features) + valueLogit(m, swapped)) < 1e-9);
  const evaluate = createValueEvaluator(m), s = board();
  assert.equal(evaluate(s, 0, catalog), -evaluate(s, 1, catalog));
});

test('value: the opponent\'s hidden hand only enters through its own side', () => {
  const a = board(), b = board();
  b.cards[b.players[1].hand[0]].cardId = 'y_25';
  const fa = valueFeatures(a, catalog), fb = valueFeatures(b, catalog);
  // Side 1's public features do not depend on which card it holds.
  assert.deepEqual([...fa.subarray(full, full + valueLayout.public)], [...fb.subarray(full, full + valueLayout.public)]);
  assert.notDeepEqual([...fa.subarray(full)], [...fb.subarray(full)]);
});

test('value: a finished match is a win or a loss whatever the network says', () => {
  const evaluate = createValueEvaluator(model()), s = board();
  s.winner = 1;
  assert.equal(evaluate(s, 1, catalog), 1_000_000);
  assert.equal(evaluate(s, 0, catalog), -1_000_000);
  assert.throws(() => createValueEvaluator({ ...model(), inputs: inputs + 1 }), /inputs/);
});

test('value: the turn search accepts a learned evaluator and still returns a legal move', () => {
  const s = board(), moves = legalMoves(s, 0, catalog);
  const decision = { state: s, side: 0, catalog, moves, random: () => 0 };
  const result = searchTurn(decision, moves[0], { evaluate: createValueEvaluator(model()), maxNodes: 300 });
  assert.ok(moves.includes(result.move));
});
