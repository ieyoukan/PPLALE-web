import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

const root = new URL('../', import.meta.url);
const problems = JSON.parse(await readFile(new URL('src/data/lethalPuzzles.json', root), 'utf8'));
const { puzzles } = JSON.parse(await readFile(new URL('src/data/lethalPuzzlePreviews.json', root), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');

test('each puzzle has a current, correctly sized capture of its real board', async () => {
  assert.deepEqual(Object.keys(puzzles), problems.map(problem => problem.id));
  for (const problem of problems) {
    const preview = puzzles[problem.id];
    assert.equal(preview.positionHash, hash(problem.code), `${problem.id}: regenerate previews after changing the board`);
    assert.match(preview.src, /^\/puzzle-previews\/[\da-z-]+-[\da-f]{16}\.webp$/);
    const bytes = await readFile(new URL(`public${preview.src}`, root));
    assert.equal(hash(bytes), preview.imageHash);
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.width, 1280);
    assert.equal(metadata.height, 720);
    assert.ok(bytes.length < 180000, 'the list should load small thumbnails');
  }
});
