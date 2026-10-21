#!/usr/bin/env node
/**
 * OGP画像生成用の PNG サムネイルを作成するスクリプト
 *
 * - カード画像（public/images/{yojo,sweet,playable}/*.webp）を OGP専用の PNG として
 *   public/og-cards/ 配下に生成する。派生画像はGit管理せず、開発・ビルド前に作る。
 * - デッキ・プロフィールOGPはこのPNGを参照する。
 * - 元画像と生成スクリプトの両方より新しいPNGはスキップする。
 *
 * 使い方: pnpm run cards:og-images
 */

import { readdir, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIRS = ['yojo', 'sweet', 'playable'];
// OGP上での最大表示幅(176px)にレティナ余裕を持たせたサイズ。転送量を抑えて生成を高速化する。
const MAX_WIDTH = 240;
const generator = await stat(fileURLToPath(import.meta.url));

let converted = 0;
let skipped = 0;

for (const dir of SRC_DIRS) {
  const srcDir = path.join(root, 'public', 'images', dir);
  const outDir = path.join(root, 'public', 'og-cards', dir);
  await mkdir(outDir, { recursive: true });

  const files = await readdir(srcDir);
  for (const file of files) {
    if (!file.toLowerCase().endsWith('.webp')) continue;

    const srcAbs = path.join(srcDir, file);
    const outAbs = path.join(outDir, file.replace(/\.webp$/i, '.png'));

    const srcStat = await stat(srcAbs);
    const outStat = await stat(outAbs).catch(() => null);
    if (outStat && outStat.mtimeMs >= Math.max(srcStat.mtimeMs, generator.mtimeMs)) {
      skipped++;
      continue;
    }

    await sharp(srcAbs)
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      // Offline compression: preserve all pixels and spend CPU here instead of on requests.
      .png({ compressionLevel: 9, palette: false, adaptiveFiltering: true })
      .toFile(outAbs);
    converted++;
  }
}

console.log(`[OK] OGP用PNG生成: ${converted} 枚 / スキップ: ${skipped} 枚`);
