import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { create } from 'fontkit';
import subsetFont from 'subset-font';
import ts from 'typescript';
import { cacheRoot } from './lib/asset-cache.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
// Stored under .next/cache, which is restored by Vercel, CI and Docker BuildKit caches.
const cache = path.join(cacheRoot, 'site-fonts');
const output = path.join(root, 'public/fonts/generated');
const revision = '47d54ca1ebb14fd864695f1d39dc734f39017c33';
export const FONT_SOURCES = [
  { id: 'zen-maru-500', family: 'Zen Maru Gothic', weight: 500, directory: 'zenmarugothic', file: 'ZenMaruGothic-Medium.ttf', sha256: '3cfdb98a13571ede17fcc769f5093a97c38b80a7b9b2ab754a26b4d822092b3b' },
  { id: 'zen-maru-700', family: 'Zen Maru Gothic', weight: 700, directory: 'zenmarugothic', file: 'ZenMaruGothic-Bold.ttf', sha256: 'fe24426b9c8b5523a0146a8235c8674eccf0493af354a53ec895c3596d9eb745' },
  { id: 'mochiy-pop-400', family: 'Mochiy Pop One', weight: 400, directory: 'mochiypopone', file: 'MochiyPopOne-Regular.ttf', sha256: '9e009430e1316c271a5f34759c6b65fc343c4e806f193042528887e7235a92c6' },
];
const hash = buffer => createHash('sha256').update(buffer).digest('hex');

/** Include JSX text and string literals, so copy changes regenerate the core automatically. */
async function codePoints(files) {
  const points = new Set(Array.from({ length: 95 }, (_, i) => i + 32));
  for (const name of files.sort()) {
    const source = ts.createSourceFile(name, await readFile(path.join(root, name), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if (ts.isStringLiteralLike(node) || ts.isJsxText(node)) {
        for (const char of node.text) points.add(char.codePointAt(0));
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return points;
}

export async function homeCodePoints() {
  const directory = 'src/components/sections';
  return codePoints((await readdir(path.join(root, directory))).filter(name => name.endsWith('.tsx') && name !== 'CardPickupDraw.tsx').map(name => `${directory}/${name}`));
}

/** The menu must not download rare-kanji blocks for ordinary setup labels. */
export async function gameMenuCodePoints() {
  // These are menu-only directories: component extraction/addition must not leave stale file names.
  const menus = await Promise.all(['src/components/game/plaza', 'src/components/game/home'].map(sourceFiles));
  return codePoints([
    ...menus.flat(), 'src/components/game/GameLobby.tsx',
    'src/components/game/GameSetup.tsx', 'src/components/game/DeckSelect.tsx',
    'src/components/game/RulePicker.tsx', 'src/components/pwa/InstallPrompt.tsx',
    'src/components/game/puzzles/copy.ts',
    'src/lib/game/deckSources.ts', 'src/lib/game/sessionStore.ts',
    'packages/game-core/src/rules.ts', 'packages/game-core/src/ai/profiles.ts',
  ]);
}

async function sourceFiles(directory) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const files = await Promise.all(entries.map(entry => {
    const name = `${directory}/${entry.name}`;
    return entry.isDirectory() ? sourceFiles(name) : /\.tsx?$/.test(entry.name) ? [name] : [];
  }));
  return files.flat();
}

/** Compact, exact ranges for the home characters. */
export function unicodeRanges(points) {
  const sorted = [...new Set(points)].sort((a, b) => a - b);
  const ranges = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    let end = start;
    while (sorted[i + 1] === end + 1) end = sorted[++i];
    ranges.push(`U+${start.toString(16).toUpperCase()}${end === start ? '' : `-${end.toString(16).toUpperCase()}`}`);
  }
  return ranges.join(',');
}

/** Disjoint core + small subsets keep arbitrary names and card text available. */
export function partitionCodePoints(characterSet, homePoints, menuPoints = new Set()) {
  const core = characterSet.filter(point => homePoints.has(point));
  const menu = characterSet.filter(point => !homePoints.has(point) && menuPoints.has(point));
  const remaining = characterSet.filter(point => !homePoints.has(point) && !menuPoints.has(point));
  const blocks = [];
  // Bound the cost of names or labels with uncommon kanji.
  for (let i = 0; i < remaining.length; i += 64) {
    const points = remaining.slice(i, i + 64);
    blocks.push({ id: `u${points[0].toString(16)}`, points });
  }
  return [{ id: 'home', points: core }, ...(menu.length ? [{ id: 'game-menu', points: menu }] : []), ...blocks];
}

/** Ranges may include unsupported characters, but never overlap the home subset.
 * The browser still uses normal font fallback when the source has no glyph.
 * Ranges between the first and last glyph avoid thousands of tiny CSS ranges.
 */
export function partRange(part, homePoints) {
  if (part.id === 'home' || part.id === 'game-menu') return unicodeRanges(part.points);
  const ranges = [];
  let start = part.points[0];
  const end = part.points.at(-1);
  for (const point of [...homePoints].filter(point => point >= start && point <= end).sort((a, b) => a - b)) {
    if (point > start) ranges.push([start, point - 1]);
    start = point + 1;
  }
  if (start <= end) ranges.push([start, end]);
  return ranges.map(([a, b]) => `U+${a.toString(16).toUpperCase()}${a === b ? '' : `-${b.toString(16).toUpperCase()}`}`).join(',');
}

export async function sourceBuffer(font) {
  const target = path.join(cache, font.file);
  let data;
  try { data = await readFile(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!data || hash(data) !== font.sha256) {
    const response = await fetch(`https://raw.githubusercontent.com/google/fonts/${revision}/ofl/${font.directory}/${font.file}`, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`Cannot download ${font.file}: ${response.status}`);
    data = Buffer.from(await response.arrayBuffer());
    if (hash(data) !== font.sha256) throw new Error(`Source checksum mismatch: ${font.file}`);
    await writeFile(target, data);
  }
  return data;
}

async function generate() {
  await mkdir(cache, { recursive: true });
  await mkdir(output, { recursive: true });
  await mkdir(path.join(root, 'src/app/generated'), { recursive: true });
  const homePoints = await homeCodePoints();
  const menuPoints = await gameMenuCodePoints();
  const corePoints = new Set([...homePoints, ...menuPoints]);
  const css = ['/* Generated by pnpm run fonts:generate; do not edit. */'];
  const manifest = [];
  for (const font of FONT_SOURCES) {
    const source = await sourceBuffer(font);
    const original = create(source);
    const parts = [];
    for (const part of partitionCodePoints(original.characterSet, homePoints, menuPoints)) {
      const text = String.fromCodePoint(...part.points);
      const key = hash(`${font.sha256}:subset-font-2.9.0:${text}`);
      const cached = path.join(cache, `${key}.woff2`);
      let data;
      try { data = await readFile(cached); } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        data = await subsetFont(source, text, { targetFormat: 'woff2' });
        await writeFile(`${cached}.tmp`, data);
        await rename(`${cached}.tmp`, cached);
      }
      const filename = `${font.id}-${part.id}-${hash(data).slice(0, 16)}.woff2`;
      await writeFile(path.join(output, filename), data);
      const range = partRange(part, corePoints);
      css.push(`@font-face{font-family:"${font.family}";font-style:normal;font-weight:${font.weight};font-display:swap;src:url("/fonts/generated/${filename}") format("woff2");unicode-range:${range}}`);
      parts.push({ ...part, range, filename, bytes: data.length });
    }
    manifest.push({ ...font, parts });
    console.log(`${font.family} ${font.weight}: ${parts[0].bytes.toLocaleString()} bytes for home; ${parts.length - 1} optional blocks`);
  }
  await writeFile(path.join(root, 'src/app/generated/site-fonts.css'), `${css.join('\n')}\n`);
  await writeFile(path.join(cache, 'manifest.json'), JSON.stringify(manifest));
  const active = new Set(manifest.flatMap(font => font.parts.map(part => part.filename)));
  for (const name of await readdir(output)) {
    if (name.endsWith('.woff2') && !active.has(name)) await unlink(path.join(output, name));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await generate();
