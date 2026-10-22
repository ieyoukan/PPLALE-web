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
const { lethalPuzzles, startPuzzle, playPuzzle, puzzleStatus, undoPuzzle, readClearedPuzzles, markPuzzleCleared } = await import(pathToFileURL(output).href);

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

test('all seven supplied boards load with their exact cards, slots and resources', () => {
  assert.deepEqual(lethalPuzzles.map(puzzle => puzzle.title), ['メロン初級①', 'メロン初級②', 'メロン中級①', 'メロン中級②', 'メロン中級③', 'メロン中級④', 'メロン中級⑤']);
  assert.equal(new Set(lethalPuzzles.map(puzzle => puzzle.id)).size, 7);
  for (const puzzle of lethalPuzzles) {
    const { game } = startPuzzle(puzzle);
    for (const [side, from] of puzzle.position.players.entries()) {
      const player = game.players[side], ids = zone => player[zone].map(uid => game.cards[uid].cardId);
      for (const zone of ['nap', 'yojo', 'sweet']) assert.deepEqual(ids(zone), from[zone]);
      assert.deepEqual(ids('hand'), from.hand.map(card => typeof card === 'string' ? card : card.id));
      assert.deepEqual(player.field.map(uid => [game.cards[uid].slot, game.cards[uid].cardId]), from.field.flatMap((unit, slot) => unit ? [[slot, unit.id]] : []));
      assert.equal(player.points, from.points);
      assert.equal(player.pp, from.pp);
      assert.equal(player.turns, from.turns);
      if (from.skills) assert.deepEqual(player.skills, from.skills);
    }
  }
  const discounted = startPuzzle(lethalPuzzles[3]).game;
  assert.equal(discounted.cards[discounted.players[0].hand[2]].costDelta, -1);
  assert.equal(discounted.cards[discounted.players[0].hand[2]].revealed, true);
  const hidden = startPuzzle(lethalPuzzles[4]).game;
  assert.equal(hidden.players[0].exSkills.kamikakushi.uses, 2);
  assert.equal(hidden.players[0].discardedYojo, 3);
  assert.equal(hidden.cards[hidden.players[0].hand[4]].hiding, false);
  const buffed = startPuzzle(lethalPuzzles[6]).game;
  const defender = buffed.cards[buffed.players[1].field[0]];
  assert.equal(defender.attackBonus, 7);
  assert.equal(defender.hpBonus, 7);
});

test('the first puzzle clears through the real cake, doughnut and two-action rules', () => {
  const initial = startPuzzle(lethalPuzzles[0]);
  const won = run(initial, winningLine);
  assert.equal(won.game.winner, 0);
  assert.equal(puzzleStatus(won), 'cleared');
  assert.equal(puzzleStatus(initial), 'playing');
  assert.equal(playPuzzle(won, { type: 'end', actor: 0 }), won);
  assert.equal(puzzleStatus(undoPuzzle(won)), 'playing');
  assert.equal(puzzleStatus(startPuzzle(lethalPuzzles[0])), 'playing');
});

test('ending without a win fails and blocks the opponent turn; undo returns to the puzzle', () => {
  const initial = startPuzzle(lethalPuzzles[0]);
  const ended = run(initial, [{ type: 'end', actor: 0 }]);
  assert.equal(puzzleStatus(ended), 'failed');
  assert.equal(playPuzzle(ended, { type: 'end', actor: 1 }), ended);
  assert.equal(undoPuzzle(ended).game, initial.game);
  assert.equal(puzzleStatus(undoPuzzle(ended)), 'playing');
  // A later-turn win must never be recorded as a solution.
  assert.equal(puzzleStatus({ ...ended, game: { ...ended.game, winner: 0 } }), 'failed');
});

test('undo includes the opponent milestone draw with the action that caused it', () => {
  const problem = structuredClone(lethalPuzzles[0]);
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
  const problem = structuredClone(lethalPuzzles[0]);
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
    assert.equal(markPuzzleCleared(lethalPuzzles[0].id), true);
    markPuzzleCleared(lethalPuzzles[0].id);
    assert.deepEqual(readClearedPuzzles(), [lethalPuzzles[0].id]);
    assert.equal(saved.get('pplale-game-session-v2'), 'existing match');
    globalThis.localStorage.setItem = () => { throw new Error('storage blocked'); };
    assert.equal(markPuzzleCleared(lethalPuzzles[1].id), false);
  } finally { delete globalThis.localStorage; }
});
