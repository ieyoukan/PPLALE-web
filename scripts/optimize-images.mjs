#!/usr/bin/env node
/**
 * カード画像の一括 WebP 変換スクリプト
 *
 * - src/data/*.json が参照する public/images/ 配下の PNG を
 *   幅 800px（= 元カード画像のフル解像度）の WebP に変換する
 * - 変換後、JSON の imageUrl を .webp 参照に書き換える
 * - 変換元の PNG は削除しない（削除は git 操作として確認しながら行う）
 *
 * 使い方: npm run cards:optimize
 */

import { readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CARD_WIDTH = 800; // CardDetail の最大表示 500px + レティナ余裕。元画像が 800px なので劣化なし
const CARD_QUALITY = 80;

const dataFiles = [
  { rel: 'src/data/yojo.json', key: 'yojo' },
  { rel: 'src/data/sweet.json', key: 'sweet' },
  { rel: 'src/data/playable.json', key: 'playable' },
  { rel: 'src/data/tokenYojo.json', key: 'tokenYojo' },
];

let converted = 0;
let skipped = 0;
let totalBefore = 0;
let totalAfter = 0;

for (const { rel, key } of dataFiles) {
  const abs = path.join(root, rel);
  let content = await readFile(abs, 'utf8');
  const data = JSON.parse(content);
  const cards = data[key];

  for (const card of cards) {
    const url = card.imageUrl;
    if (!url || !url.toLowerCase().endsWith('.png')) {
      skipped++;
      continue;
    }

    const srcAbs = path.join(root, 'public', url);
    let size;
    try {
      size = (await stat(srcAbs)).size;
    } catch {
      console.warn(`[SKIP] 画像が存在しません: ${url}`);
      skipped++;
      continue;
    }

    const outUrl = url.replace(/\.png$/i, '.webp');
    const outAbs = path.join(root, 'public', outUrl);

    await sharp(srcAbs, { failOn: 'none' })
      .resize({ width: CARD_WIDTH, withoutEnlargement: true })
      .webp({ quality: CARD_QUALITY })
      .toFile(outAbs);

    const after = (await stat(outAbs)).size;
    totalBefore += size;
    totalAfter += after;
    converted++;

    // JSON の imageUrl 値のみ差し替え（ファイル全体の再シリアライズはしない）
    const oldQuoted = JSON.stringify(url);
    const newQuoted = JSON.stringify(outUrl);
    if (!content.includes(oldQuoted)) {
      console.warn(`[WARN] JSON 内に見つからない imageUrl: ${url}`);
    }
    content = content.split(oldQuoted).join(newQuoted);
  }

  await writeFile(abs, content, 'utf8');
  console.log(`[OK] ${rel} を更新しました`);
}

console.log('---');
console.log(`変換: ${converted} 枚 / スキップ: ${skipped} 枚`);
console.log(
  `サイズ: ${(totalBefore / 1024 / 1024).toFixed(1)}MB -> ${(totalAfter / 1024 / 1024).toFixed(1)}MB`
);
console.log('変換元の PNG と public/Resized は内容確認のうえ削除してください');
