#!/usr/bin/env node
// Capture the real BoardTable shared by /game/play and /game/puzzle, never a second board layout.
// Run `pnpm run dev` first, then `pnpm run puzzles:images` (or pass --url for another local server).
import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const { values } = parseArgs({ options: { url: { type: 'string', default: 'http://localhost:3000' }, id: { type: 'string', multiple: true } } });
const base = new URL(values.url);
const problems = (await Promise.all(['introPuzzles', 'lethalPuzzles'].map(async name => JSON.parse(await readFile(path.join(root, `src/data/${name}.json`), 'utf8'))))).flat();
if (values.id?.some(id => !problems.some(problem => problem.id === id))) throw new Error('存在しない問題IDです');
const manifestPath = path.join(root, 'src/data/lethalPuzzlePreviews.json');
const previous = await readFile(manifestPath, 'utf8').then(JSON.parse).catch(() => ({ puzzles: {} }));
const output = path.join(root, 'public/puzzle-previews');
await mkdir(output, { recursive: true });
const hash = value => createHash('sha256').update(value).digest('hex');
const puzzles = {};
const browser = await chromium.launch();
try {
  // A fresh context has no account or saved match, and capture never touches the user's browser.
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await context.newPage();
  for (const problem of problems) {
    // 指定した問題だけ撮り直す場合も、未変更の画像と問題順は保持する。
    if (values.id?.length && !values.id.includes(problem.id)) {
      const kept = previous.puzzles[problem.id];
      if (!kept || kept.positionHash !== hash(problem.code)) throw new Error(`${problem.id}: 画像の再生成が必要です`);
      puzzles[problem.id] = kept;
      continue;
    }
    const url = new URL('/game/puzzle/', base);
    url.searchParams.set('id', problem.id);
    await page.goto(url.href);
    const board = page.locator(`[data-puzzle="${problem.id}"][data-puzzle-revision="0"]`);
    await board.waitFor({ timeout: 60000 });
    if (problem.lesson) await page.getByRole('button', { name: '挑戦する', exact: true }).click();
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images, image => image.decode()));
    });
    // Only the menu/actions are hidden. Cards, hands, counters, PP and their layout are untouched.
    await page.addStyleTag({ content: `
      [data-puzzle] > header, [data-puzzle] > [role="toolbar"],
      [data-puzzle] > button[aria-label="全画面"],
      [data-puzzle] [class*="endTurnButton"], nextjs-portal { visibility: hidden !important; }
    ` });
    const capture = await board.screenshot({ animations: 'disabled' });
    const webp = await sharp(capture).webp({ quality: 88 }).toBuffer();
    const filename = `${problem.id}-${hash(webp).slice(0, 16)}.webp`;
    await writeFile(path.join(output, filename), webp);
    puzzles[problem.id] = { src: `/puzzle-previews/${filename}`, width: 1280, height: 720, positionHash: hash(problem.code), imageHash: hash(webp) };
    console.log(`${problem.id}: ${webp.length.toLocaleString()} bytes`);
  }
} finally { await browser.close(); }

await writeFile(manifestPath, `${JSON.stringify({ version: 1, renderer: 'BoardTable (/game/play)', puzzles }, null, 2)}\n`);
// Prune only old derivatives recorded in this manifest, never unrelated images.
for (const old of Object.values(previous.puzzles)) {
  if (Object.values(puzzles).some(image => image.src === old.src)) continue;
  if (/^\/puzzle-previews\/[\da-z-]+\.webp$/.test(old.src)) await unlink(path.join(output, path.basename(old.src))).catch(() => {});
}
