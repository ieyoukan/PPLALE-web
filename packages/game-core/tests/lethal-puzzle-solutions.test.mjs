import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { applyCommand, buildPosition, decodePosition } from '../dist/index.js';
import { catalog } from './helpers.mjs';

const puzzles = ['introPuzzles', 'lethalPuzzles'].flatMap(name => JSON.parse(readFileSync(new URL(`../../../src/data/${name}.json`, import.meta.url), 'utf8')));
const solutions = JSON.parse(readFileSync(new URL('./fixtures/lethal-puzzle-solutions.json', import.meta.url), 'utf8'));

test('every recorded lethal puzzle solution still wins for the recorded seeds', () => {
  // 入門5問と、以前から解答を記録しているメロンの7問を欠かさず検証する。
  const original = puzzles.filter(puzzle => puzzle.fruit === 'intro' || (puzzle.fruit === 'melon' && puzzle.difficulty !== '上級'));
  for (const puzzle of original) assert.ok(solutions.puzzles[puzzle.id], puzzle.id);
  for (const [id, { codeHash, commands }] of Object.entries(solutions.puzzles)) {
    const puzzle = puzzles.find(puzzle => puzzle.id === id);
    assert.ok(puzzle, `solution refers to an unknown puzzle: ${id}`);
    assert.equal(codeHash, createHash('sha256').update(puzzle.code).digest('hex'), id);
    assert.ok(commands.length > 0, id);
    for (const seed of solutions.seeds) {
      let state = buildPosition(decodePosition(puzzle.code), catalog, { seed });
      const started = { actor: state.active, turnNumber: state.turn };
      for (const [step, command] of commands.entries()) {
        const result = applyCommand(state, command, catalog);
        assert.equal(result.error, undefined, `${id}, seed ${seed}, step ${step + 1}`);
        state = result.state;
        assert.equal(state.active, started.actor, `${id}, seed ${seed}, step ${step + 1}`);
        assert.equal(state.turn, started.turnNumber, `${id}, seed ${seed}, step ${step + 1}`);
      }
      assert.equal(state.winner, started.actor, `${id}, seed ${seed}`);
    }
  }
});
