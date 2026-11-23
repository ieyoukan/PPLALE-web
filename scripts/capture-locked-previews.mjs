#!/usr/bin/env node
// 限定公開のパズルの盤面画像を、公開パズルと同じ BoardTable から撮影する（generate-puzzle-previews.mjs と同じ撮り方）。
// 平文の画像はリポジトリに置かず、平文のJSONの隣の <fruit>-previews/ に保存する。続けて lock-puzzles.mjs で暗号化する。
// 使い方: `pnpm run dev` の起動中に
//   PUZZLE_PASSWORD=... node scripts/capture-locked-previews.mjs <fruit> <平文のJSON> [--url http://localhost:3000]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const { values, positionals: [fruit, source] } = parseArgs({ allowPositionals: true, options: { url: { type: 'string', default: 'http://localhost:3000' } } });
const password = process.env.PUZZLE_PASSWORD?.normalize('NFKC').trim();
if (!fruit || !source || !password) {
  console.error('PUZZLE_PASSWORD=... node scripts/capture-locked-previews.mjs <fruit> <plain.json> [--url ...]');
  process.exit(1);
}
const problems = JSON.parse(await readFile(source, 'utf8'));
const output = path.join(path.dirname(source), `${fruit}-previews`);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  // 撮影用のブラウザだけを解錠済みにする。
  await context.addInitScript(([key, value]) => localStorage.setItem(key, value), ['pplale-puzzle-keys-v1', JSON.stringify({ [fruit]: password })]);
  const page = await context.newPage();
  for (const problem of problems) {
    const url = new URL('/game/puzzle/', values.url);
    url.searchParams.set('id', problem.id);
    await page.goto(url.href);
    const board = page.locator(`[data-puzzle="${problem.id}"][data-puzzle-revision="0"]`);
    await board.waitFor({ timeout: 60000 });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images, image => image.decode()));
    });
    await page.addStyleTag({ content: `
      [data-puzzle] > header, [data-puzzle] > [role="toolbar"],
      [data-puzzle] > button[aria-label="全画面"],
      [data-puzzle] [class*="endTurnButton"], nextjs-portal { visibility: hidden !important; }
    ` });
    const webp = await sharp(await board.screenshot({ animations: 'disabled' })).webp({ quality: 88 }).toBuffer();
    await writeFile(path.join(output, `${problem.id}.webp`), webp);
    console.log(`${problem.id}: ${webp.length.toLocaleString()} bytes`);
  }
} finally { await browser.close(); }
