import test from 'node:test';
import assert from 'node:assert/strict';
import { arena, field, run } from './helpers.mjs';

const end = s => run(s, { type: 'end', actor: s.active });
/** Both sides out of cards, so a turn only has an action if someone chooses one. */
function exhausted(options = {}) {
  const s = arena(options);
  for (const p of s.players) Object.assign(p, { yojo: [], sweet: [] });
  return s;
}

test('three turns in a row without any action end the match; more sweet points wins', () => {
  let s = exhausted({ me: { points: 5 }, foe: { points: 8 } });
  s = end(end(s));
  assert.equal(s.winner, null, 'two idle turns are not enough');
  s = end(s);
  assert.equal(s.winner, 1);
  assert.match(s.log.at(-1), /3回続いた/);
});

test('equal sweet points: the second player wins', () => {
  for (const firstPlayer of [0, 1]) {
    let s = exhausted({ me: { points: 7 }, foe: { points: 7 } });
    s.rules.firstPlayer = firstPlayer;
    s = end(end(end(s)));
    assert.equal(s.winner, firstPlayer === 0 ? 1 : 0);
  }
});

test('a unit action, a play, a skill or a draw restarts the count', () => {
  let s = exhausted({ me: { field: ['y_25'], points: 5, playable: 'p_3' }, foe: { points: 12 } });
  s = end(end(s));
  s = run(s, { type: 'attack', actor: s.active, uid: field(s)[0], target: 'leader' });
  s = end(end(s));
  assert.equal(s.winner, null, 'the attack made that turn count as active');
  s = run(s, { type: 'skill', actor: s.active, index: 1 });
  s = end(end(s));
  assert.equal(s.winner, null, 'so did the skill: its turn and one idle turn have passed');
  s = end(end(s));
  assert.equal(s.winner, 1);
  // With cards left, every turn starts with a draw, so the match never stalls.
  let drawing = arena();
  for (let i = 0; i < 6; i++) {
    drawing = end(drawing);
    drawing = run(drawing, { type: 'choose', actor: drawing.active, option: 'yojo' });
  }
  assert.equal(drawing.winner, null);
});

test('when neither side can ever act again the match ends at once', () => {
  let s = exhausted({ me: { points: 9 }, foe: { points: 4 } });
  for (const p of s.players) p.skills = p.skills.map(() => 0);
  s = end(s);
  assert.equal(s.winner, 0);
  assert.match(s.log.at(-1), /行動できなくなった/);
  // A unit that can still attack keeps the match open until three idle turns pass.
  s = exhausted({ me: { field: ['y_25'] } });
  for (const p of s.players) p.skills = p.skills.map(() => 0);
  assert.equal(end(s).winner, null);
});
