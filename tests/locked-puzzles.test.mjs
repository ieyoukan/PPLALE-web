import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// あいことばは公開リポジトリに置かない。PUZZLE_PASSWORD を渡したときだけ中身まで確かめる。
const directory = await mkdtemp(join(tmpdir(), 'pplale-locked-'));
after(() => rm(directory, { recursive: true, force: true }));
const output = join(directory, 'locked.mjs');
await build({
  stdin: { contents: `export * from './src/lib/game/lockedPuzzles'; export { startPuzzle, puzzleStatus, lethalPuzzles, toLethalPuzzle } from './src/lib/game/puzzles';`, resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'esm', outfile: output, logLevel: 'silent',
});
const { lockedPuzzleFruits, checkPassword, startPuzzle, puzzleStatus, lethalPuzzles, toLethalPuzzle } = await import(pathToFileURL(output).href);
const locked = JSON.parse(await readFile(new URL('../src/data/lockedPuzzles.json', import.meta.url), 'utf8'));

test('locked groups ship only ciphertext and refuse a wrong password', async () => {
  assert.deepEqual(lockedPuzzleFruits.map(fruit => fruit.id), ['orange']);
  const raw = JSON.stringify(locked);
  assert.doesNotMatch(raw, /PPL1\.|"code"|orange-(beginner|intermediate|advanced)/);
  assert.ok(lethalPuzzles.every(puzzle => puzzle.fruit !== 'orange'));
  assert.equal(await checkPassword('orange', 'wrong'), false);
  assert.equal(await checkPassword('orange', ''), false);
  assert.equal(await checkPassword('unknown', 'wrong'), false);
});

test('the correct password opens every locked board', { skip: !process.env.PUZZLE_PASSWORD && 'PUZZLE_PASSWORD is not set' }, async () => {
  const password = process.env.PUZZLE_PASSWORD;
  // 全角や前後の空白でも同じあいことばとして扱う。
  assert.equal(await checkPassword('orange', ` ${password.replace(/[a-z]/g, letter => String.fromCodePoint(letter.codePointAt(0) + 0xfee0))} `), true);
  const { webcrypto: crypto } = await import('node:crypto');
  const group = locked.orange, bytes = value => Buffer.from(value, 'base64');
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: bytes(group.salt), iterations: group.iterations }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const problems = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(group.iv) }, key, bytes(group.data))));
  assert.equal(problems.length, group.count);
  for (const problem of problems) {
    const { game } = startPuzzle(toLethalPuzzle(problem));
    assert.equal(puzzleStatus({ game, initial: game }), 'playing', problem.id);
  }
});
