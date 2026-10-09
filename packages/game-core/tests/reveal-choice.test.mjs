import test from 'node:test';
import assert from 'node:assert/strict';
import { pendingView, restoreGame, viewFor } from '../dist/index.js';
import { cpuCommand, legalMoves } from '../dist/ai/index.js';
import { arena, catalog, choose, field, hand, optionIds, playFirst, run, stats } from './helpers.mjs';

test('reveal selections can be undone, including after selecting every eligible card', () => {
  let s = playFirst(arena({ me: { hand: ['y_31', 'y_60', 'y_60'] } }), 'y_31');
  const [a, b] = hand(s), before = s;
  s = choose(choose(s, a), b);
  assert.equal(s.pending.task.step, 'reveal');
  assert.deepEqual(pendingView(s).reveal.selected, [a, b]);
  assert.deepEqual(optionIds(s), ['done', a, b]);
  assert.ok(hand(s).every(uid => !s.cards[uid].revealed));
  assert.deepEqual(stats(s, field(s)[0]), [1, 1]);
  assert.deepEqual(before.pending.task.ids, [], 'choosing must not mutate previous states');
  s = choose(s, a);
  assert.deepEqual(pendingView(s).reveal.selected, [b]);
  s = choose(s, 'done');
  assert.equal(s.cards[a].revealed, false);
  assert.equal(s.cards[b].revealed, true);
  assert.deepEqual(stats(s, field(s)[0]), [1, 1]);
  assert.equal(s.pending, null, 'one revealed card does not meet the bonus threshold');
});

test('the full revealed-hand bonus resolves only after explicit completion', () => {
  let s = playFirst(arena({ me: { hand: ['y_31', 'y_60', 'y_60'] } }), 'y_31');
  for (const uid of hand(s)) s = choose(s, uid);
  assert.deepEqual(stats(s, field(s)[0]), [1, 1]);
  assert.equal(s.pending.task.step, 'reveal');
  s = choose(s, 'done');
  assert.deepEqual(stats(s, field(s)[0]), [2, 2]);
  assert.equal(s.pending.task.op, 'draw');
});

test('undoing every draft choice and completing reveals nothing; already public cards remain public', () => {
  let s = arena({ me: { hand: ['y_31', 'y_60', 'y_60'] } });
  const alreadyPublic = hand(s)[1]; s.cards[alreadyPublic].revealed = true;
  s = playFirst(s, 'y_31'); const concealed = hand(s)[1];
  assert.deepEqual(optionIds(s), ['done', concealed]);
  s = choose(choose(s, concealed), concealed);
  s = choose(s, 'done');
  assert.equal(s.cards[concealed].revealed, false);
  assert.equal(s.cards[alreadyPublic].revealed, true);
  assert.deepEqual(stats(s, field(s)[0]), [1, 1]);
});

test('a private draft survives save/restore and exposes neither cards nor selections to the opponent', () => {
  let s = playFirst(arena({ me: { hand: ['y_31', 'y_60', 'y_60'] } }), 'y_31');
  const [a, b] = hand(s); s = choose(s, a);
  s = restoreGame(JSON.parse(JSON.stringify(s)), catalog);
  assert.ok(s);
  assert.deepEqual(pendingView(s).reveal.selected, [a]);
  assert.deepEqual(pendingView(viewFor(s, 0)).reveal.selected, [a]);
  const opponent = viewFor(s, 1);
  assert.equal(opponent.cards[a].cardId, 'hidden');
  assert.equal(opponent.cards[b].cardId, 'hidden');
  assert.equal(opponent.pending.task.ids, undefined);
  assert.equal(pendingView(opponent).reveal, undefined);
  assert.ok(!opponent.pending.options.some(option => option.id === a || option.id === b));
  s = choose(choose(s, a), b);
  s = choose(s, 'done');
  assert.equal(viewFor(s, 1).cards[a].cardId, 'hidden');
  assert.equal(viewFor(s, 1).cards[b].cardId, 'y_60');
});

test('completing a reveal with no selected cards is allowed', () => {
  let s = playFirst(arena({ me: { hand: ['y_31', 'y_60'] } }), 'y_31');
  const uid = hand(s)[0]; s = choose(s, 'done');
  assert.equal(s.cards[uid].revealed, false);
  assert.equal(s.pending, null);
});

for (const level of ['easy', 'normal', 'hard', 'master']) test(`${level} CPU finishes a reversible reveal without selecting any card twice`, () => {
  let s = playFirst(arena({ me: { hand: ['y_31', 'y_60', 'y_60'] } }), 'y_31');
  const picked = new Set();
  for (let i = 0; s.pending?.task.step === 'reveal'; i++) {
    assert.ok(i < 3, 'two card choices and completion must suffice');
    const command = cpuCommand(s, catalog, { level });
    assert.ok(command);
    assert.equal(command.type, 'choose');
    if (command.option !== 'done') {
      assert.ok(!picked.has(command.option)); picked.add(command.option);
    }
    s = run(s, command);
  }
});

test('legalMoves still offers humans the choice to deselect a draft card', () => {
  let s = playFirst(arena({ me: { hand: ['y_31', 'y_60'] } }), 'y_31');
  const uid = hand(s)[0]; s = choose(s, uid);
  assert.ok(legalMoves(s, 0, catalog).some(move => move.command.type === 'choose' && move.command.option === uid));
});
