import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const directory = await mkdtemp(join(tmpdir(), 'pplale-puzzles-'));
after(() => rm(directory, { recursive: true, force: true }));
const output = join(directory, 'puzzles.mjs');
await build({
  stdin: { contents: `export * from './src/lib/game/puzzles';`, resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'esm', outfile: output, logLevel: 'silent',
});
const { lethalPuzzles, puzzleFruits, puzzleDifficulties, startPuzzle, playPuzzle, puzzleStatus, undoPuzzle, readClearedPuzzles, markPuzzleCleared } = await import(pathToFileURL(output).href);
const problemById = id => {
  const puzzle = lethalPuzzles.find(problem => problem.id === id);
  assert.ok(puzzle, id);
  return puzzle;
};
const firstMelonPuzzle = problemById('melon-beginner-1');

const winningLine = [
  { type: 'play', uid: 'c1' }, { type: 'skill', index: 1 },
  { type: 'play', uid: 'c2' }, { type: 'choose', option: 'c1' },
  { type: 'play', uid: 'c4' }, { type: 'choose', option: 'c1' },
  { type: 'play', uid: 'c3' }, { type: 'choose', option: 'c1' },
  { type: 'play', uid: 'c5' }, { type: 'choose', option: 'c6' }, { type: 'choose', option: 'c1' },
  { type: 'play', uid: 'c8' }, { type: 'choose', option: 'c7' }, { type: 'choose', option: 'c1' },
  { type: 'attack', uid: 'c1', target: 'leader' }, { type: 'attack', uid: 'c1', target: 'leader' },
].map(command => ({ ...command, actor: 0 }));
function run(attempt, commands) {
  for (const command of commands) {
    attempt = playPuzzle(attempt, command);
    assert.equal(attempt.error, '', JSON.stringify(command));
  }
  return attempt;
}

test('all 25 supplied boards load with their exact cards, slots and resources', () => {
  assert.equal(lethalPuzzles.length, 25);
  assert.equal(new Set(lethalPuzzles.map(puzzle => puzzle.id)).size, 25);
  const counts = { strawberry: [3, 2, 1], grape: [1, 3, 2], melon: [2, 5, 6] };
  for (const fruit of puzzleFruits) {
    for (const [index, difficulty] of puzzleDifficulties.entries()) {
      const group = lethalPuzzles.filter(puzzle => puzzle.fruit === fruit.id && puzzle.difficulty === difficulty);
      assert.deepEqual(group.map(puzzle => puzzle.title), Array.from({ length: counts[fruit.id][index] }, (_, number) => `${fruit.label}${difficulty}${String.fromCodePoint(0x2460 + number)}`));
    }
  }
  for (const puzzle of lethalPuzzles) {
    const { game } = startPuzzle(puzzle);
    assert.equal(puzzleStatus({ game, initial: game }), 'playing', puzzle.id);
    for (const [side, from] of puzzle.position.players.entries()) {
      const player = game.players[side], ids = zone => player[zone].map(uid => game.cards[uid].cardId);
      for (const zone of ['nap', 'yojo', 'sweet']) assert.deepEqual(ids(zone), from[zone]);
      assert.deepEqual(ids('exile'), from.exile ?? []);
      assert.deepEqual(ids('hand'), from.hand.map(card => typeof card === 'string' ? card : card.id));
      assert.deepEqual(player.field.map(uid => [game.cards[uid].slot, game.cards[uid].cardId]), from.field.flatMap((unit, slot) => unit ? [[slot, unit.id]] : []));
      assert.equal(player.points, from.points);
      assert.equal(player.maxPoints, from.maxPoints);
      assert.equal(player.pp, from.pp);
      assert.equal(player.turns, from.turns);
      assert.equal(player.ppBonus, from.maxPp - from.turns);
      if (from.skills) assert.deepEqual(player.skills, from.skills);
      if (from.played) assert.deepEqual(player.played, from.played);
      if (from.exSkills) assert.deepEqual(player.exSkills, from.exSkills);
      assert.equal(player.mochidaLeft, from.mochidaLeft ?? 0);
      assert.equal(player.shield, from.shield ?? false);
    }
  }
  const discounted = startPuzzle(problemById('melon-intermediate-2')).game;
  assert.equal(discounted.cards[discounted.players[0].hand[2]].costDelta, -1);
  assert.equal(discounted.cards[discounted.players[0].hand[2]].revealed, true);
  const hidden = startPuzzle(problemById('melon-intermediate-3')).game;
  assert.equal(hidden.players[0].exSkills.kamikakushi.uses, 2);
  assert.equal(hidden.players[0].discardedYojo, 3);
  assert.equal(hidden.cards[hidden.players[0].hand[4]].hiding, false);
  assert.deepEqual(problemById('melon-intermediate-3').position.players[1].field, [null, null, null, { id: 'y_111' }]);
  assert.deepEqual(hidden.players[1].field.map(uid => [hidden.cards[uid].slot, hidden.cards[uid].cardId]), [[3, 'y_111']]);
  const buffed = startPuzzle(problemById('melon-intermediate-5')).game;
  const defender = buffed.cards[buffed.players[1].field[0]];
  assert.equal(defender.attackBonus, 7);
  assert.equal(defender.hpBonus, 7);
});

test('new advanced puzzles preserve revealed discounts, hiding and barriers', () => {
  const discounted = startPuzzle(problemById('strawberry-advanced-1')).game;
  for (const uid of discounted.players[0].hand.slice(-2)) {
    assert.equal(discounted.cards[uid].costDelta, -6);
    assert.equal(discounted.cards[uid].revealed, true);
  }
  const hiding = startPuzzle(problemById('grape-advanced-1')).game;
  const riri = hiding.players[1].field.find(uid => hiding.cards[uid].slot === 4);
  assert.equal(hiding.cards[riri].hiding, true);
  const melon = startPuzzle(problemById('melon-advanced-6')).game;
  assert.equal(melon.cards[melon.players[0].hand[2]].hiding, false);
  assert.equal(melon.cards[melon.players[0].nap[1]].hiding, false);
  assert.equal(melon.cards[melon.players[1].field[0]].shield, true);
});

test('the first puzzle clears through the real cake, doughnut and two-action rules', () => {
  const initial = startPuzzle(firstMelonPuzzle);
  const won = run(initial, winningLine);
  assert.equal(won.game.winner, 0);
  assert.equal(puzzleStatus(won), 'cleared');
  assert.equal(puzzleStatus(initial), 'playing');
  assert.equal(playPuzzle(won, { type: 'end', actor: 0 }), won);
  assert.equal(puzzleStatus(undoPuzzle(won)), 'playing');
  assert.equal(puzzleStatus(startPuzzle(firstMelonPuzzle)), 'playing');
});

test('ending without a win fails and blocks the opponent turn; undo returns to the puzzle', () => {
  const initial = startPuzzle(firstMelonPuzzle);
  const ended = run(initial, [{ type: 'end', actor: 0 }]);
  assert.equal(puzzleStatus(ended), 'failed');
  assert.equal(playPuzzle(ended, { type: 'end', actor: 1 }), ended);
  assert.equal(undoPuzzle(ended).game, initial.game);
  assert.equal(puzzleStatus(undoPuzzle(ended)), 'playing');
  // A later-turn win must never be recorded as a solution.
  assert.equal(puzzleStatus({ ...ended, game: { ...ended.game, winner: 0 } }), 'failed');
});

test('undo includes the opponent milestone draw with the action that caused it', () => {
  const problem = structuredClone(firstMelonPuzzle);
  problem.position.players[1].sweet = ['s_19'];
  const prepared = run(startPuzzle(problem), winningLine.slice(0, -2));
  const attacked = run(prepared, [winningLine.at(-2)]);
  assert.equal(attacked.game.pending.task.actor, 1);
  const answered = run(attacked, [{ type: 'choose', actor: 1, option: 'sweet' }]);
  assert.equal(answered.game.players[1].hand.length, 2);
  assert.equal(undoPuzzle(answered).game, prepared.game);
  assert.deepEqual(undoPuzzle(answered).commands, prepared.commands);
});

test('a forced victory during end-of-turn resolution still clears', () => {
  const problem = structuredClone(firstMelonPuzzle);
  const me = problem.position.players[0], foe = problem.position.players[1];
  me.field = []; me.hand = []; me.skills = [0, 0];
  foe.field = []; foe.hand = []; foe.skills = [0, 0, 0, 0];
  foe.points = 1;
  const ended = run(startPuzzle(problem), [{ type: 'end', actor: 0 }]);
  assert.equal(ended.game.winner, 0);
  assert.equal(puzzleStatus(ended), 'cleared');
});

test('progress tolerates invalid storage, deduplicates clears and never overwrites the saved match', () => {
  const saved = new Map([['pplale-game-session-v2', 'existing match'], ['pplale-lethal-cleared-v1', '{bad json']]);
  globalThis.localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
  try {
    assert.deepEqual(readClearedPuzzles(), []);
    assert.equal(markPuzzleCleared(firstMelonPuzzle.id), true);
    markPuzzleCleared(firstMelonPuzzle.id);
    assert.deepEqual(readClearedPuzzles(), [firstMelonPuzzle.id]);
    assert.equal(saved.get('pplale-game-session-v2'), 'existing match');
    globalThis.localStorage.setItem = () => { throw new Error('storage blocked'); };
    assert.equal(markPuzzleCleared(lethalPuzzles[1].id), false);
  } finally { delete globalThis.localStorage; }
});
