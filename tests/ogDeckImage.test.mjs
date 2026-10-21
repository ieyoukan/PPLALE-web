import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { build } from 'esbuild';
import sharp from 'sharp';

await mkdir('.cache', { recursive: true });
const directory = await mkdtemp(resolve('.cache/og-tests-'));
const output = join(directory, 'renderer.cjs');
await build({ entryPoints: ['src/lib/ogDeckImage.ts'], outfile: output, bundle: true, platform: 'node', format: 'cjs', external: ['sharp'] });
const { getOgDeckImage } = createRequire(import.meta.url)(output);
after(() => rm(directory, { recursive: true, force: true }));
const catalog = await Promise.all(['yojo', 'sweet', 'playable'].map(async type => JSON.parse(await readFile(`src/data/${type}.json`, 'utf8'))[type]));

test('OGP card compression preserves every pixel of the resized source without palette quantization', async () => {
  for (const card of catalog.flat()) {
    const input = `public${card.imageUrl}`;
    const output = input.replace('/images/', '/og-cards/').replace(/\.webp$/i, '.png');
    const reference = await sharp(input).resize({ width: 240, withoutEnlargement: true }).png({ palette: false }).toBuffer();
    const expected = await sharp(reference).ensureAlpha().raw().toBuffer();
    const actual = await sharp(output).ensureAlpha().raw().toBuffer();
    assert.ok(actual.equals(expected), `${card.id}: compression changed card pixels`);
    assert.equal((await sharp(output).metadata()).isPalette, false, card.id);
  }
});

test('all catalog assets generate valid 1200×630 PNGs without network access', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw Error('OGP must not fetch network assets'); };
  try {
    for (const [index, type] of ['yojoDeckIds', 'sweetDeckIds', 'playableCardId'].entries()) {
      await Promise.all(catalog[index].map(async card => {
        const { bytes } = await getOgDeckImage({ [type]: index === 2 ? card.id : [card.id] });
        const { width, height, format } = await sharp(bytes).metadata();
        assert.deepEqual({ width, height, format }, { width: 1200, height: 630, format: 'png' });
      }));
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('full deck shares simultaneous work and cached output; records cold/warm timings', async () => {
  const data = { yojoDeckIds: Array(20).fill('y_0'), sweetDeckIds: Array(10).fill('s_0'), playableCardId: 'p_0' };
  const start = performance.now();
  const results = await Promise.all(Array.from({ length: 8 }, () => getOgDeckImage(data)));
  const firstMs = performance.now() - start;
  for (const result of results) assert.strictEqual(result.bytes, results[0].bytes);
  const warmStart = performance.now();
  const warm = await getOgDeckImage(data);
  const warmMs = performance.now() - warmStart;
  assert.strictEqual(warm.bytes, results[0].bytes);
  assert.equal(warm.etag, results[0].etag);
  console.log(`Full deck first composition: ${firstMs.toFixed(1)}ms; memory cache: ${warmMs.toFixed(1)}ms (local, assets already warm)`);
  const { data: pixels, info } = await sharp(warm.bytes).raw().toBuffer({ resolveWithObject: true });
  for (const [x, y] of [[50, 75], [466, 537], [608, 90], [1124, 274], [636, 498]]) {
    const offset = (y * info.width + x) * info.channels;
    assert.notDeepEqual([...pixels.subarray(offset, offset + 3)], [238, 238, 238], `Card missing at ${x},${y}`);
  }
});

test('order-independent cache, deck changes and malformed IDs are handled safely', async () => {
  const a = await getOgDeckImage({ yojoDeckIds: ['y_0', 'y_1'] });
  const b = await getOgDeckImage({ yojoDeckIds: ['y_1', 'y_0'] });
  assert.strictEqual(a.bytes, b.bytes);
  assert.notEqual(a.etag, (await getOgDeckImage({ yojoDeckIds: ['y_0'] })).etag);
  const blank = await getOgDeckImage({});
  const malformed = await getOgDeckImage({ yojoDeckIds: ['../secret', 'p_0', null, 12], sweetDeckIds: 's_0', playableCardId: 'y_0' });
  assert.strictEqual(blank.bytes, malformed.bytes);
  const bounded = await getOgDeckImage({ yojoDeckIds: Array(20).fill('y_0') });
  const overfull = await getOgDeckImage({ yojoDeckIds: Array(200).fill('y_0') });
  assert.strictEqual(bounded.bytes, overfull.bytes);
});

test('every Japanese and English catalog card has a small prebuilt WebP thumbnail', async () => {
  const english = await Promise.all(['yojo', 'sweet', 'playable'].map(async type => JSON.parse(await readFile(`src/data/en/${type}.json`, 'utf8'))[type]));
  for (const card of [...catalog.flat(), ...english.flat()]) {
    const path = `public${card.imageUrl.replace(/^\/images\//, '/deck-thumbnails/')}`;
    const { width, format } = await sharp(path).metadata();
    assert.ok(width <= 160, `${card.id}: oversized thumbnail`);
    assert.equal(format, 'webp');
  }
});
