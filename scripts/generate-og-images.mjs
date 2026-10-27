#!/usr/bin/env node
/**
 * OGP画像生成用の PNG サムネイルを作成するスクリプト
 *
 * - カード画像（public/images/{yojo,sweet,playable}/*.webp）を OGP専用の PNG として
 *   public/og-cards/ 配下に生成する。派生画像はGit管理せず、開発・ビルド前に作る。
 * - デッキ・プロフィールOGPはこのPNGを参照する。
 * - 生成物は .next/cache/pplale-assets に内容ハッシュ付きで保存し、public/ へリンクする。
 *   元画像・スクリプトが変わらない限り、クリーンなチェックアウトでも再生成しない。
 *
 * 使い方: pnpm run cards:og-images
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { cacheRoot, cached, digest, prune, publish, root, sourceSignature } from './lib/asset-cache.mjs';

const SRC_DIRS = ['yojo', 'sweet', 'playable'];
// OGP上での最大表示幅(176px)にレティナ余裕を持たせたサイズ。転送量を抑えて生成を高速化する。
const MAX_WIDTH = 240;
const SETTINGS = `og-cards:${MAX_WIDTH}:png-9-nopalette`;
const version = await sourceSignature(import.meta.url);

let converted = 0;
let skipped = 0;

for (const dir of SRC_DIRS) {
  const srcDir = path.join(root, 'public', 'images', dir);
  const outDir = path.join(root, 'public', 'og-cards', dir);
  const cacheDir = path.join(cacheRoot, 'og-cards', dir);
  const keep = new Set();
  const published = new Set();

  const files = await readdir(srcDir);
  for (const file of files) {
    if (!file.toLowerCase().endsWith('.webp')) continue;

    const bytes = await readFile(path.join(srcDir, file));
    const name = file.replace(/\.webp$/i, '.png');
    const cachedName = `${name.slice(0, -'.png'.length)}-${digest(SETTINGS, version, bytes)}.png`;
    const cachedFile = path.join(cacheDir, cachedName);
    keep.add(cachedName);
    published.add(name);

    const rendered = await cached(cachedFile, temp => sharp(bytes)
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      // Offline compression: preserve all pixels and spend CPU here instead of on requests.
      .png({ compressionLevel: 9, palette: false, adaptiveFiltering: true })
      .toFile(temp));
    if (rendered) converted++;
    else skipped++;

    await publish(cachedFile, path.join(outDir, name));
  }

  await prune(cacheDir, keep);
  await prune(outDir, published);
}

console.log(`[OK] OGP用PNG生成: ${converted} 枚 / キャッシュ: ${skipped} 枚`);
