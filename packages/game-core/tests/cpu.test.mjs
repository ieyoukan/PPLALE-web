import test from 'node:test';
import assert from 'node:assert/strict';
import { actingSides, applyCommand, cpuCommand, cpuLevels, determinize, legalMoves, newGame, sandboxRules } from '../dist/index.js';
import { arena, catalog, field, hand, play } from './helpers.mjs';

const yojo = Array.from({ length: 31 }, (_, i) => `y_${i}`), sweets = Array.from({ length: 28 }, (_, i) => `s_${i}`);
/** A random legal strawberry deck. */
function randomDeck(seed) {
  let r = seed;
  const next = n => { r = (Math.imul(r, 1103515245) + 12345) >>> 0; return r % n; };
  const sodas = sweets.slice(0, 6).filter(() => next(2)).slice(0, 2);
  return {
    name: `deck${seed}`, playable: `p_${seed % 6}`,
    yojo: Array.from({ length: 20 }, () => yojo[next(yojo.length)]),
    sweet: [...sodas, ...Array.from({ length: 10 - sodas.length }, () => sweets[6 + next(22)])],
  };
}

/**
 * Plays a whole match between two CPU levels; returns the final state. Fails on any rejected command.
 * Running out of cards loses here: with the sandbox default two walled-up CPUs can stall forever.
 */
function match(levels, seed, limit = 4000) {
  let s = newGame([randomDeck(seed), randomDeck(seed * 31 + 7)], catalog, { ...sandboxRules, emptyDeckLoses: true }, seed);
  for (let i = 0; i < limit && s.winner === null; i++) {
    const [side] = actingSides(s);
    const command = s.phase === 'dice' ? { type: 'roll', actor: side } : cpuCommand(s, catalog, { level: levels[side], side });
    assert.ok(command, `no command at ${s.phase}`);
    const result = applyCommand(s, command, catalog);
    assert.equal(result.error, undefined, `${levels[side]} sent ${JSON.stringify(command)}: ${result.error}`);
    s = result.state;
  }
  return s;
}

test('legal moves are exactly the commands the engine accepts', () => {
  const s = arena({ me: { hand: ['y_9', 's_22', 'y_28'], field: ['y_20'], pp: 3, playable: 'p_1' }, foe: { field: ['y_23'] } });
  const moves = legalMoves(s, 0, catalog);
  const kinds = moves.map(m => m.command.type === 'play' ? `play:${s.cards[m.command.uid].cardId}` : m.command.type === 'attack' ? `attack:${m.command.target === 'leader' ? 'leader' : 'unit'}` : m.command.type === 'skill' ? `skill:${m.command.index}` : m.command.type);
  // s_22 (10) and y_28 (6) are too expensive; guard (y_23) blocks the sweets; p_1 skill 1-3 cost ≤ 3.
  assert.deepEqual(kinds.sort(), ['attack:unit', 'end', 'play:y_9', 'skill:0', 'skill:1', 'skill:2', 'skill:3'].sort());
  for (const move of moves) assert.equal(applyCommand(s, move.command, catalog).error, undefined);
  assert.deepEqual(legalMoves(s, 1, catalog), [], 'not side 1\'s turn');
});

test('a pending choice only allows answering it', () => {
  let s = arena({ me: { hand: ['y_9'] }, foe: { field: ['y_23', 'y_17'] } });
  s = play(s, hand(s)[0]);
  const moves = legalMoves(s, 0, catalog);
  assert.deepEqual(moves.map(m => m.command), field(s, 1).map(option => ({ type: 'choose', actor: 0, option })));
});

test('mulligan moves cover keep and every exchange plan (3^n)', () => {
  let s = newGame([randomDeck(1), randomDeck(2)], catalog, sandboxRules, 3);
  while (s.phase !== 'mulligan') {
    const [side] = actingSides(s);
    s = applyCommand(s, s.phase === 'dice' ? { type: 'roll', actor: side } : cpuCommand(s, catalog, { side }), catalog).state;
  }
  for (const side of [0, 1]) assert.equal(legalMoves(s, side, catalog).length, 3 ** s.mulligan.eligible[side].length);
});

test('the CPU only sees a re-guessed opponent hand and deck order', () => {
  const s = arena({ me: { hand: ['y_9', 'y_12'] }, foe: { hand: ['s_22', 'y_28', 'y_29'] } });
  s.cards[hand(s, 1)[2]].revealed = true;
  const original = structuredClone(s);
  const known = determinize(s, 0, catalog, 99);
  assert.deepEqual(s, original, 'the real state is untouched');
  assert.deepEqual(known.players[0].hand, s.players[0].hand);
  assert.equal(known.players[1].hand[2], s.players[1].hand[2], 'revealed cards stay');
  for (const kind of ['yojo', 'sweet']) {
    const pool = st => [...st.players[1][kind], ...st.players[1].hand.filter(uid => catalog[st.cards[uid].cardId].type === kind)].sort();
    assert.deepEqual(pool(known), pool(s), `${kind}: same cards, other places`);
  }
  assert.notDeepEqual(known.players[1].hand.slice(0, 2), s.players[1].hand.slice(0, 2));
  assert.notEqual(known.rng, s.rng);
});

for (const level of cpuLevels) {
  test(`${level}: plays complete matches with only legal commands`, () => {
    for (let seed = 1; seed <= 8; seed++) assert.notEqual(match([level, level], seed).winner, null);
  });
}

test('levels are ordered: hard beats normal and normal beats easy over many matches', () => {
  const wins = (a, b) => {
    let count = 0;
    for (let seed = 1; seed <= 20; seed++) {
      // Swap seats on odd seeds so first-player advantage cancels out.
      const flip = seed % 2 === 1, levels = flip ? [b, a] : [a, b];
      if (match(levels, seed).winner === (flip ? 1 : 0)) count++;
    }
    return count;
  };
  const normalVsEasy = wins('normal', 'easy'), hardVsNormal = wins('hard', 'normal');
  console.log(`normal vs easy ${normalVsEasy}/20, hard vs normal ${hardVsNormal}/20`);
  assert.ok(normalVsEasy >= 14, 'normal vs easy');
  assert.ok(hardVsNormal >= 11, 'hard vs normal');
});
