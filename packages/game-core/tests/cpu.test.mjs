import test from 'node:test';
import assert from 'node:assert/strict';
import { actingSides, applyCommand, cpuCommand, cpuLevels, determinize, legalMoves, newGame, playMatch, randomStrawberryDeck, sandboxRules } from '../dist/index.js';
import { arena, catalog, field, hand, play, run } from './helpers.mjs';

/** Plays a whole match between two CPU levels; playMatch throws on any rejected command. */
const match = (levels, seed) => playMatch(catalog, { levels, seed });

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
  let s = newGame([randomStrawberryDeck(1), randomStrawberryDeck(2)], catalog, sandboxRules, 3);
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
    // さいきょう searches every turn; against よわい the matches stay short and the suite fast.
    const opponent = level === 'master' ? 'easy' : level, games = level === 'master' ? 4 : 8;
    for (let seed = 1; seed <= games; seed++) assert.notEqual(match(seed % 2 ? [level, opponent] : [opponent, level], seed).winner, null);
  });
}

// さいきょう vs つよい is measured with `npm run cpu:arena` (too slow for the unit tests).
for (const level of ['hard', 'master']) {
  test(`${level}: breaks pancake protection instead of ending an empty-deck match forever`, () => {
    let s = arena({ me: { field: ['y_16', 'y_16'], pp: 0 }, foe: { points: 1 } });
    for (const p of s.players) {
      p.yojo = [];
      p.sweet = [];
      p.skills = p.skills.map(() => 0);
    }
    s.players[1].shield = true;
    const first = cpuCommand(s, catalog, { side: 0, level });
    assert.equal(first.type, 'attack');
    assert.equal(first.target, 'leader');
    s = run(s, first);
    assert.equal(s.players[1].shield, false);
    assert.equal(s.players[1].points, 1);
    s = run(s, cpuCommand(s, catalog, { side: 0, level }));
    assert.equal(s.winner, 0);
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
