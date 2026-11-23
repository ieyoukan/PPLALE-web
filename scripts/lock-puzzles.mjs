// 限定公開のリーサルパズルを、あいことばで暗号化して src/data/lockedPuzzles.json に書き込む。
// リポジトリは公開なので、平文の問題リストとあいことばはコミットしない。
// 使い方: PUZZLE_PASSWORD=... node scripts/lock-puzzles.mjs <fruit> <label> <平文のJSON>
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto as crypto } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'src/data/lockedPuzzles.json');
const [fruit, label, source] = process.argv.slice(2);
const password = process.env.PUZZLE_PASSWORD?.normalize('NFKC').trim();
if (!fruit || !label || !source || !password) {
  console.error('PUZZLE_PASSWORD=... node scripts/lock-puzzles.mjs <fruit> <label> <plain.json>');
  process.exit(1);
}

const { decodePosition } = await import(path.join(root, 'packages/game-core/dist/index.js'));
const problems = JSON.parse(await readFile(source, 'utf8'));
const ids = new Set();
for (const problem of problems) {
  if (ids.has(problem.id)) throw new Error(`id が重複しています: ${problem.id}`);
  ids.add(problem.id);
  if (problem.fruit !== fruit) throw new Error(`fruit が ${fruit} ではありません: ${problem.id}`);
  if (!['初級', '中級', '上級'].includes(problem.difficulty)) throw new Error(`difficulty が不正です: ${problem.id}`);
  if (!decodePosition(problem.code)?.title) throw new Error(`盤面コードを読み込めません: ${problem.id}`);
}

// 復号は src/lib/game/lockedPuzzles.ts と同じ形式（PBKDF2-SHA256 → AES-GCM）。
const iterations = 250_000;
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(problems))));
const base64 = bytes => Buffer.from(bytes).toString('base64');

let locked = {};
try { locked = JSON.parse(await readFile(output, 'utf8')); } catch { /* 初回 */ }
locked[fruit] = { label, count: problems.length, iterations, salt: base64(salt), iv: base64(iv), data: base64(data) };
await writeFile(output, `${JSON.stringify(locked, null, 2)}\n`);
console.log(`${label}: ${problems.length}問を ${path.relative(root, output)} に書き込みました`);
