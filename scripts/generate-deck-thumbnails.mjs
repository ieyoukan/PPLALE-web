#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { cacheRoot, cached, digest, prune, publish, root, sourceSignature } from './lib/asset-cache.mjs';

const SETTINGS = 'deck-thumbnails:160:60';
const version = await sourceSignature(import.meta.url);
let generated = 0;
let skipped = 0;
for (const directory of ['yojo', 'sweet', 'playable', 'en/yojo', 'en/sweet', 'en/playable']) {
  const source = path.join(root, 'public/images', directory);
  const output = path.join(root, 'public/deck-thumbnails', directory);
  const cacheDir = path.join(cacheRoot, 'deck-thumbnails', directory);
  const keep = new Set();
  const published = new Set();
  for (const file of await readdir(source)) {
    if (!file.endsWith('.webp')) continue;
    const bytes = await readFile(path.join(source, file));
    const cachedName = `${file.slice(0, -'.webp'.length)}-${digest(SETTINGS, version, bytes)}.webp`;
    const cachedFile = path.join(cacheDir, cachedName);
    keep.add(cachedName);
    published.add(file);
    const rendered = await cached(cachedFile, temp => sharp(bytes).resize({ width: 160, withoutEnlargement: true }).webp({ quality: 60 }).toFile(temp));
    if (rendered) generated++;
    else skipped++;
    await publish(cachedFile, path.join(output, file));
  }
  await prune(cacheDir, keep);
  await prune(output, published);
}
console.log(`[OK] Deck thumbnails: ${generated} generated / ${skipped} cached`);
