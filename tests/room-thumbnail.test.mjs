import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { build } from 'esbuild';
import sharp from 'sharp';
import subsetFont from 'subset-font';
import { FONT_SOURCES, sourceBuffer } from '../scripts/generate-site-fonts.mjs';

await mkdir('.cache', { recursive: true });
const directory = await mkdtemp(resolve('.cache/room-image-tests-'));
const renderPath = join(directory, 'render.cjs'), rulesPath = join(directory, 'rules.cjs');
await Promise.all([
  build({ entryPoints: ['src/lib/ogRoomImage.tsx'], outfile: renderPath, bundle: true, platform: 'node', format: 'cjs', external: ['sharp', 'next/og'] }),
  build({ entryPoints: ['src/lib/game/roomThumbnail.ts'], outfile: rulesPath, bundle: true, platform: 'node', format: 'cjs' }),
]);
after(() => rm(directory, { recursive: true, force: true }));
const require = createRequire(import.meta.url);
const { getOgRoomImage } = require(renderPath);
const { roomThumbnail, roomThumbnailTheme, thumbnailPath, parseThumbnail } = require(rulesPath);
const fruits = ['strawberry', 'grape', 'melon', 'orange'];

const luminance = hex => {
  const rgb = hex.match(/[\da-f]{2}/gi).map(channel => parseInt(channel, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
};

test('the highest allowed fruit selects a pale theme, regardless of input order', () => {
  const colours = new Set();
  for (let count = 1; count <= 4; count++) {
    const theme = roomThumbnailTheme({ fruits: fruits.slice(0, count).reverse() });
    assert.equal(theme.fruit, fruits[count - 1]); colours.add(theme.background);
    for (const surface of [theme.background, theme.band]) assert.ok((luminance(surface) + .05) / (luminance('#634747') + .05) >= 4.5);
  }
  assert.equal(colours.size, 4);
  assert.equal(roomThumbnailTheme({ fruits: [] }).fruit, 'strawberry');
});

test('thumbnails and OGP share all rule combinations through a fresh cache version', () => {
  for (let count = 1; count <= 4; count++) for (const extended of [false, true]) for (const turn of [null, 120, 180, 300]) {
    const rules = { fruits: fruits.slice(0, count), extendedPlayable: extended, turnSeconds: turn };
    const thumbnail = roomThumbnail({ ...rules, name: 'private room', invite: 'secret' });
    const url = new URL(thumbnailPath(thumbnail), 'https://example.test');
    assert.equal(url.searchParams.get('v'), 'r5');
    assert.deepEqual(parseThumbnail(url.searchParams), thumbnail);
    assert.ok(!url.href.includes('secret') && !url.href.includes('private'));
  }
});

test('each fruit renders an 800×420 poster, with category-specific card art and shared font work', async () => {
  // Pinned font sources are populated by the existing font generation step. Image rendering itself
  // has no external requests in this test, while exercising real Satori text and card composition.
  const specs = FONT_SOURCES.filter(font => font.id === 'mochiy-pop-400' || font.id === 'zen-maru-700');
  const originals = new Map(await Promise.all(specs.map(async font => [font.family, await sourceBuffer(font)])));
  const subsets = new Map(); let fontRequests = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(input);
    if (url.hostname === 'fonts.googleapis.com') {
      fontRequests++;
      const family = url.searchParams.get('family').split(':')[0];
      subsets.set(family, await subsetFont(originals.get(family), url.searchParams.get('text'), { targetFormat: 'sfnt' }));
      return new Response(`src: url(https://og-fonts.test/${encodeURIComponent(family)}) format('truetype')`);
    }
    if (url.hostname === 'og-fonts.test') return new Response(subsets.get(decodeURIComponent(url.pathname.slice(1))));
    throw new Error(`Unexpected network request: ${url.hostname}`);
  };
  try {
    for (let count = 1; count <= 4; count++) {
      const normal = { fruits: fruits.slice(0, count), extended: false, turn: null };
      const pending = getOgRoomImage(normal);
      assert.strictEqual(getOgRoomImage(normal), pending);
      const bytes = await pending;
      const metadata = await sharp(bytes).metadata();
      assert.deepEqual([metadata.width, metadata.height, metadata.format], [800, 420, 'jpeg']);
      const corner = await sharp(bytes).extract({ left: 2, top: 2, width: 1, height: 1 }).raw().toBuffer();
      const rgb = roomThumbnailTheme(normal).background.match(/[\da-f]{2}/gi).map(channel => parseInt(channel, 16));
      rgb.forEach((value, index) => assert.ok(Math.abs(corner[index] - value) < 5, `fruit ${count}: background channel ${index}`));
      const extended = await getOgRoomImage({ ...normal, extended: true, turn: 180 });
      const cardCrop = image => sharp(image).extract({ left: 570, top: 232, width: 55, height: 100 }).raw().toBuffer();
      assert.ok(!(await cardCrop(bytes)).equals(await cardCrop(extended)), 'extended playable must change the featured card');
    }
    assert.equal(fontRequests, 2, 'all posters reuse the same two font subsets');
  } finally { globalThis.fetch = originalFetch; }
});
