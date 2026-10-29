import assert from 'node:assert/strict';
import { readFile, stat, access } from 'node:fs/promises';
import { test } from 'node:test';
import sharp from 'sharp';
import { ROOM_CHAT_STAMPS } from '../packages/game-core/src/chatStamps.ts';

const root = new URL('../', import.meta.url);
const sheet = JSON.parse(await readFile(new URL('src/lib/game/generated/chat-stamps.json', root)));

test('stamp sheets preserve all registered artwork, transparency and detail with smaller transfers', async () => {
  assert.deepEqual(sheet.ids, ROOM_CHAT_STAMPS.map(stamp => stamp.id));
  assert.equal(new Set(sheet.ids).size, sheet.ids.length);
  const sources = await Promise.all(sheet.ids.map(id => readFile(new URL(`src/assets/chat/stamps/${id}.webp`, root))));
  const originalBytes = sources.reduce((sum, source) => sum + source.length, 0);

  for (const format of ['avif', 'webp']) {
    assert.match(sheet[format], /^\/game-assets\/chat\/stamps-[a-f0-9]{16}\.(avif|webp)$/);
    assert.ok(sheet[format].endsWith(`.${format}`));
    const file = new URL(`public${sheet[format]}`, root);
    const metadata = await sharp(file.pathname).metadata();
    assert.equal(metadata.width, sheet.columns * sheet.size);
    assert.equal(metadata.height, sheet.rows * sheet.size);
    assert.equal(metadata.hasAlpha, true);
    assert.ok((await stat(file)).size < originalBytes * (format === 'avif' ? .35 : .5));
    const decoded = await sharp(file.pathname).raw().toBuffer({ resolveWithObject: true });

    for (const [index, source] of sources.entries()) {
      const original = await sharp(source).flatten({ background: '#fffdf9' }).raw().toBuffer();
      const tile = await sharp(decoded.data, { raw: decoded.info }).extract({
        left: index % sheet.columns * sheet.size, top: Math.floor(index / sheet.columns) * sheet.size,
        width: sheet.size, height: sheet.size,
      }).png().toBuffer();
      const actual = await sharp(tile).flatten({ background: '#fffdf9' }).raw().toBuffer();
      assert.equal(actual.length, original.length);
      // 見た目を保つ品質の下限。色の差は画素ごとに比べ、順序違い・切り落としも検出する。
      const error = actual.reduce((sum, value, pixel) => sum + (value - original[pixel]) ** 2, 0);
      assert.ok(Math.sqrt(error / actual.length) / 255 < .025, `${format}: ${sheet.ids[index]}`);
      const alpha = await sharp(tile).extractChannel('alpha').stats();
      assert.equal(alpha.channels[0].min, 0);
      assert.equal(alpha.channels[0].max, 255);
    }
  }
});

test('individual stamp sources are outside public paths', async () => {
  for (const { id } of ROOM_CHAT_STAMPS) {
    await assert.rejects(access(new URL(`public/images/chat/stamps/${id}.webp`, root)), { code: 'ENOENT' });
  }
});
