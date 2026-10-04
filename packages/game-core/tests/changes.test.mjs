// Presentation coverage: every piece of state is classified, and every card's effect is visible
// as at least one change, so no card can resolve silently on the board.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, changesBetween, instanceFields, playerFields, scriptOf, stateFields } from '../dist/index.js';
import { arena, catalog, field, hand } from './helpers.mjs';

test('every field of the state is classified for presentation', () => {
  const s = arena({ me: { field: ['y_9'], hand: ['s_0'] } });
  s.effectRoll = { revision: 0, side: 0, value: 1 };
  s.effectBlocks = { revision: 0, events: [] };
  s.stall = { acted: false, idleTurns: 0 };
  for (const key of Object.keys(s)) assert.ok(key in stateFields, `GameState.${key} is not classified in changes.ts`);
  for (const key of Object.keys(s.players[0])) assert.ok(key in playerFields, `Player.${key} is not classified in changes.ts`);
  for (const key of Object.keys(s.cards[field(s)[0]])) assert.ok(key in instanceFields, `Instance.${key} is not classified in changes.ts`);
});

test('changes list moves, damage, points and PP of one command', () => {
  const s = arena({ me: { field: ['y_20'] }, foe: { field: ['y_9'] } });
  const [attacker] = field(s), [defender] = field(s, 1);
  const after = applyCommand(s, { type: 'attack', actor: 0, uid: attacker, target: defender }, catalog).state;
  const kinds = changesBetween(s, after).map(c => `${c.kind}:${c.uid ?? c.side}`);
  assert.ok(kinds.includes(`damage:${attacker}`));
  assert.ok(kinds.includes(`move:${defender}`), 'the destroyed unit moves to the nap');
});

/**
 * Plays `cardId` on a busy board that meets the strawberry cards' conditions (いのむー on the field,
 * a second doughnut in hand, a manager in the deck, five うゆち played), answering every choice
 * with its first option.
 */
function playOut(cardId, seed) {
  const s = arena({
    seed,
    me: { hand: [cardId, 's_19', 's_12', 'y_9'], field: ['y_9', 'y_16'], nap: ['y_9', 'y_23'], yojo: ['y_24', 'y_9', 'y_1'], sweet: ['s_19', 's_11', 's_15'], pp: 12, points: 8 },
    foe: { hand: ['y_9', 'y_9'], field: ['y_9', 'y_23'], points: 10 },
  });
  s.players[0].played = Array(5).fill('y_2');
  for (const uid of field(s, 1)) s.cards[uid].ateOn = s.turn - 1;
  const uid = hand(s).find(id => s.cards[id].cardId === cardId);
  const before = s;
  let next = applyCommand(s, { type: 'play', actor: 0, uid }, catalog);
  if (next.error) return { error: next.error };
  let state = next.state, changes = changesBetween(before, state);
  for (let i = 0; i < 20 && state.pending; i++) {
    const r = applyCommand(state, { type: 'choose', actor: state.pending.task.actor, option: state.pending.options[0].id }, catalog);
    changes = changes.concat(changesBetween(state, r.state));
    state = r.state;
  }
  // The play itself (the card leaving the hand, the PP paid) is not the effect.
  return { changes: changes.filter(c => !(c.uid === uid && c.kind === 'move') && !(c.kind === 'pp' && c.side === 0 && c.amount < 0)) };
}

test('every strawberry card with a play effect shows at least one change when played', () => {
  // Units without an on-play effect (keywords, auras, destruction triggers) show those on the board.
  const ids = Object.keys(catalog).filter(id => /^(y_([0-9]|[12][0-9]|30)|s_([0-9]|1[0-9]|2[0-7]))$/.test(id) && scriptOf(id).onPlay);
  const silent = [];
  for (const id of ids) {
    const runs = [1, 2, 3].map(seed => playOut(id, seed));
    if (runs.every(r => r.error)) continue;
    if (runs.every(r => r.error || r.changes.length === 0)) silent.push(id);
  }
  assert.deepEqual(silent, [], `these cards resolved with nothing to show: ${silent.join(', ')}`);
});
