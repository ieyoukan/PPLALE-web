#!/usr/bin/env node
import { readdir, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const generator = await stat(fileURLToPath(import.meta.url));
let generated = 0;
for (const directory of ['yojo', 'sweet', 'playable', 'en/yojo', 'en/sweet', 'en/playable']) {
  const source = path.join(root, 'public/images', directory);
  const output = path.join(root, 'public/deck-thumbnails', directory);
  await mkdir(output, { recursive: true });
  for (const file of await readdir(source)) {
    if (!file.endsWith('.webp')) continue;
    const inputPath = path.join(source, file);
    const outputPath = path.join(output, file);
    const input = await stat(inputPath);
    const existing = await stat(outputPath).catch(() => null);
    if (existing && existing.mtimeMs >= Math.max(input.mtimeMs, generator.mtimeMs)) continue;
    await sharp(inputPath).resize({ width: 160, withoutEnlargement: true }).webp({ quality: 60 }).toFile(outputPath);
    generated++;
  }
}
console.log(`[OK] Deck thumbnails: ${generated} generated`);
