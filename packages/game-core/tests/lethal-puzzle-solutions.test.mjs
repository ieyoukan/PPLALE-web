import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { applyCommand, buildPosition, decodePosition } from '../dist/index.js';
import { catalog } from './helpers.mjs';

const puzzles = JSON.parse(readFileSync(new URL('../../../src/data/lethalPuzzles.json', import.meta.url), 'utf8'));
const solutions = JSON.parse(readFileSync(new URL('./fixtures/lethal-puzzle-solutions.json', import.meta.url), 'utf8'));

test('every published lethal puzzle has a verified solution for the recorded seeds', () => {
  assert.deepEqual(Object.keys(solutions.puzzles).sort(), puzzles.map(puzzle => puzzle.id).sort());
  for (const puzzle of puzzles) {
    const solution = solutions.puzzles[puzzle.id];
    assert.equal(solution.codeHash, createHash('sha256').update(puzzle.code).digest('hex'), puzzle.id);
    assert.ok(solution.commands.length > 0, puzzle.id);
    for (const seed of solutions.seeds) {
      let state = buildPosition(decodePosition(puzzle.code), catalog, { seed });
      const { active, turn } = state;
      for (const [step, command] of solution.commands.entries()) {
        const result = applyCommand(state, command, catalog);
        assert.equal(result.error, undefined, `${puzzle.id}, seed ${seed}, step ${step + 1}`);
        state = result.state;
        assert.equal(state.active, active, `${puzzle.id}, seed ${seed}, step ${step + 1}`);
        assert.equal(state.turn, turn, `${puzzle.id}, seed ${seed}, step ${step + 1}`);
      }
      assert.equal(state.winner, active, `${puzzle.id}, seed ${seed}`);
    }
  }
});
