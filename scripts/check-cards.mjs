#!/usr/bin/env node
/**
 * カード画像とデータの整合性チェックスクリプト（CI 用）
 *
 * - src/data/*.json の imageUrl が実在するファイルを指しているか（エラー）
 * - public/images/{yojo,sweet,playable} に未参照のファイルが無いか（警告）
 *
 * 使い方: npm run cards:check
 * 終了コード: 参照切れがあると 1
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const dataFiles = [
  { rel: 'src/data/yojo.json', key: 'yojo', dir: 'public/images/yojo' },
  { rel: 'src/data/sweet.json', key: 'sweet', dir: 'public/images/sweet' },
  { rel: 'src/data/playable.json', key: 'playable', dir: 'public/images/playable' },
  { rel: 'src/data/tokenYojo.json', key: 'tokenYojo', dir: 'public/images/yojo' },
  { rel: 'src/data/en/yojo.json', key: 'yojo', dir: 'public/images/en/yojo' },
  { rel: 'src/data/en/sweet.json', key: 'sweet', dir: 'public/images/en/sweet' },
  { rel: 'src/data/en/playable.json', key: 'playable', dir: 'public/images/en/playable' },
  { rel: 'src/data/en/tokenYojo.json', key: 'tokenYojo', dir: 'public/images/en/yojo' },
];

let errors = 0;
let warnings = 0;

// dir は yojo.json と tokenYojo.json で共有されるため、警告判定用の参照集合はディレクトリ単位で合算する
const referencedByDir = new Map();

for (const { rel, key, dir } of dataFiles) {
  const data = JSON.parse(await readFile(path.join(root, rel), 'utf8'));
  const cards = data[key];

  const referenced = referencedByDir.get(dir) ?? new Set();
  referencedByDir.set(dir, referenced);

  for (const card of cards) {
    const url = card.imageUrl;
    if (!url) {
      console.error(`[ERROR] ${rel}: id=${card.id} に imageUrl がありません`);
      errors++;
      continue;
    }
    if (url.toLowerCase().endsWith('.png')) {
      console.error(
        `[ERROR] ${rel}: imageUrl が .png のままです (id=${card.id})。` +
          `npm run cards:optimize を実行して .webp に変換してください: ${url}`
      );
      errors++;
    }
    referenced.add(url.split('/').pop());
    const abs = path.join(root, 'public', url);
    try {
      const s = await stat(abs);
      if (!s.isFile()) throw new Error('not a file');
    } catch {
      console.error(`[ERROR] ${rel}: 参照先が存在しません: ${url} (id=${card.id})`);
      errors++;
    }
  }
}

for (const [dir, referenced] of referencedByDir) {
  const files = await readdir(path.join(root, dir));
  for (const f of files) {
    if (!referenced.has(f)) {
      console.warn(`[WARN] ${dir}: 未参照のファイル: ${f}`);
      warnings++;
    }
  }
}

console.log(`---\nエラー: ${errors} / 警告: ${warnings}`);
process.exit(errors > 0 ? 1 : 0);
