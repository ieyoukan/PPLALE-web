#!/usr/bin/env node
/**
 * カードデータ原本（Google スプレッドシート）から CSV を取得するスクリプト
 *
 * 前提: .env に CARD_DATA_SHEET_ID=<スプレッドシートID> を設定しておくこと
 *       （タブ名 -> gid の対応は scripts/sheet-tabs.json を参照）
 *
 * 使い方:
 *   node scripts/fetch-sheet-csv.mjs <タブ名>              # 標準出力にCSVを表示
 *   node scripts/fetch-sheet-csv.mjs <タブ名> --out foo.csv
 *   node scripts/fetch-sheet-csv.mjs --all --out-dir .cache/sheets
 */

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  process.loadEnvFile(path.join(root, '.env'));
} catch {
  // .env が無い場合は既に環境変数が設定されている前提で続行する
}

const sheetId = process.env.CARD_DATA_SHEET_ID;
if (!sheetId) {
  console.error('[ERROR] 環境変数 CARD_DATA_SHEET_ID が設定されていません（.env を確認してください）');
  process.exit(1);
}

const tabs = JSON.parse(await readFile(path.join(root, 'scripts/sheet-tabs.json'), 'utf8'));

async function fetchTabCsv(name) {
  const gid = tabs[name];
  if (gid === undefined) {
    throw new Error(`不明なタブ名です: ${name}（利用可能: ${Object.keys(tabs).join(', ')}）`);
  }
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`取得に失敗しました (status ${res.status}): ${name}`);
  }
  return await res.text();
}

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outDirIndex = args.indexOf('--out-dir');
const all = args.includes('--all');

if (all) {
  const outDir = outDirIndex >= 0 ? args[outDirIndex + 1] : '.cache/sheets';
  const outDirAbs = path.join(root, outDir);
  await mkdir(outDirAbs, { recursive: true });
  for (const name of Object.keys(tabs)) {
    const csv = await fetchTabCsv(name);
    const file = path.join(outDirAbs, `${name}.csv`);
    await writeFile(file, csv, 'utf8');
    console.log(`[OK] ${name} -> ${path.relative(root, file)}`);
  }
} else {
  const name = args.find((a) => !a.startsWith('--'));
  if (!name) {
    console.error(
      '使い方: node scripts/fetch-sheet-csv.mjs <タブ名> [--out ファイル] | --all [--out-dir ディレクトリ]'
    );
    console.error('利用可能なタブ名:', Object.keys(tabs).join(', '));
    process.exit(1);
  }
  const csv = await fetchTabCsv(name);
  if (outIndex >= 0) {
    const outPath = path.join(root, args[outIndex + 1]);
    await writeFile(outPath, csv, 'utf8');
    console.log(`[OK] ${path.relative(root, outPath)} に保存しました`);
  } else {
    process.stdout.write(csv);
  }
}
