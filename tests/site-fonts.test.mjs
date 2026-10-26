import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { create } from 'fontkit';
import { gameMenuCodePoints, homeCodePoints, unicodeRanges } from '../scripts/generate-site-fonts.mjs';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('.cache/site-fonts/manifest.json', root), 'utf8'));

test('Unicode ranges are exact and compact at block boundaries', () => {
  assert.equal(unicodeRanges([0x100, 0xFE, 0xFF, 0x100, 0x102]), 'U+FE-100,U+102');
});

test('menu font extraction covers the current split launchpad and its shared copy', async () => {
  const points = await gameMenuCodePoints();
  for (const character of 'ソーシャルいまのルームプロフィールロリの一手を極めるために') {
    assert.ok(points.has(character.codePointAt(0)), `menu character missing: ${character}`);
  }
});

for (const font of manifest) {
  test(`${font.family} ${font.weight}: preserve all characters and glyphs across disjoint subsets`, async () => {
    const source = create(await readFile(new URL(`.cache/site-fonts/${font.file}`, root)));
    const homePoints = await homeCodePoints();
    const menuPoints = await gameMenuCodePoints();
    const advertised = new Set();
    const core = font.parts.find(part => part.id === 'home');
    assert.deepEqual(core.points, source.characterSet.filter(point => homePoints.has(point)));
    assert.ok(core.bytes < 70_000, 'home font must remain small');
    for (const part of font.parts) {
      const subset = create(await readFile(new URL(`public/fonts/generated/${part.filename}`, root)));
      // HarfBuzz can retain mirrored/layout glyphs (e.g. ‹ for ›). Their cmap
      // entries are valid, but CSS must only advertise this part's disjoint range.
      assert.ok(part.points.every(point => subset.characterSet.includes(point)), 'retain every advertised glyph');
      assert.ok(subset.characterSet.every(point => point === 0xFFFF || source.characterSet.includes(point)), 'extra layout glyphs must also come from the original');
      assert.equal(subset.unitsPerEm, source.unitsPerEm);
      assert.equal(subset.ascent, source.ascent);
      assert.equal(subset.descent, source.descent);
      for (const point of part.points) {
        assert.ok(!advertised.has(point), `overlapping unicode-range: ${point}`);
        advertised.add(point);
        assert.equal(subset.glyphForCodePoint(point).advanceWidth, source.glyphForCodePoint(point).advanceWidth);
      }
      const ranges = part.range.split(',').map(range => range.slice(2).split('-').map(value => Number.parseInt(value, 16)));
      const covers = point => ranges.some(([start, end = start]) => point >= start && point <= end);
      assert.ok(part.points.every(covers), 'CSS must expose every subset character');
      if (part.id !== 'home' && part.id !== 'game-menu') {
        assert.ok([...homePoints].every(point => !covers(point)), 'home characters must never trigger additional subsets');
        assert.ok([...menuPoints].every(point => !covers(point)), 'setup labels must never trigger rare-kanji subsets');
        assert.ok(part.points.length <= 64);
      }
      // Check outlines for every home character and samples from every optional block.
      const samples = part.id === 'home' ? part.points : [part.points[0], part.points[Math.floor(part.points.length / 2)], part.points.at(-1)];
      for (const point of samples) assert.deepEqual(subset.glyphForCodePoint(point).path.commands, source.glyphForCodePoint(point).path.commands);
    }
    assert.deepEqual([...advertised].sort((a, b) => a - b), source.characterSet);
    assert.ok(font.parts.some(part => part.id !== 'home' && part.points.some(point => point >= 0x4E00 && point <= 0x9FFF)), 'retain kanji outside the home copy');
  });
}

test('generated font CSS stays external, small, and uses immutable asset names', async () => {
  const css = await readFile(new URL('src/app/generated/site-fonts.css', root), 'utf8');
  // More small fallback faces prevent a rare kanji from downloading a large font.
  assert.ok(Buffer.byteLength(css) < 120_000);
  assert.ok(gzipSync(css).length < 16_000);
  for (const font of manifest) {
    for (const part of font.parts) {
      assert.match(part.filename, /-[\da-f]{16}\.woff2$/);
      assert.ok(css.includes(`unicode-range:${part.range}`));
    }
  }
});
