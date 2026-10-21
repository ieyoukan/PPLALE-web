import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { test } from 'node:test';
import { build } from 'esbuild';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const { cards } = JSON.parse(await readFile(new URL('src/lib/game/generated/card-assets.json', root)));
const source = [];
for (const file of ['yojo', 'sweet', 'playable', 'tokenYojo', 'token']) source.push(...Object.values(JSON.parse(await readFile(new URL(`src/data/${file}.json`, root))))[0]);

test('every live card has immutable, correctly sized AVIF and WebP assets', async () => {
  assert.equal(Object.keys(cards).length, source.length);
  let originalBytes = 0, avifBytes = 0;
  for (const card of source) {
    const original = new URL(`public${card.imageUrl}`, root);
    const metadata = await sharp(fileURLToPath(original)).metadata();
    originalBytes += (await stat(original)).size;
    for (const format of ['avif', 'webp']) {
      const url = cards[card.id][format];
      assert.match(url, /-[\da-f]{16}\.(avif|webp)$/);
      const file = new URL(`public${url}`, root);
      const generated = await sharp(fileURLToPath(file)).metadata();
      assert.equal(generated.width, Math.min(640, metadata.width));
      assert.ok(Math.abs(generated.height / generated.width - metadata.height / metadata.width) < .003);
      if (format === 'avif') avifBytes += (await stat(file)).size;
    }
  }
  assert.ok(avifBytes < originalBytes * .65);
});

test('room preparation depends only on public rules and includes generated tokens', async () => {
  const bundle = await build({ entryPoints: [new URL('src/lib/game/matchAssets.ts', root).pathname], bundle: true, format: 'esm', platform: 'node', write: false });
  const { roomMatchCardIds, localMatchCardIds } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
  const rules = { fruits: ['strawberry'], extendedPlayable: false };
  const ids = roomMatchCardIds(rules);
  for (const card of source) {
    if (card.id.startsWith('token_') || card.id.startsWith('yt_')) assert.ok(ids.includes(card.id), card.id);
    if (card.fruit === 'grape') assert.ok(!ids.includes(card.id), card.id);
  }
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length < source.length);
  assert.ok(localMatchCardIds([], rules).every(id => cards[id]));
});
