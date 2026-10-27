import { createHash } from 'node:crypto';
import { availableParallelism } from 'node:os';
import { copyFile, link, mkdir, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../../', import.meta.url));

/**
 * `.next/cache` survives `next build` (cleanDistDir keeps it) and is restored by Vercel's
 * build cache, so derived card images can be reused on clean checkouts too.
 */
export const cacheRoot = process.env.PPLALE_ASSET_CACHE
  ? path.resolve(process.env.PPLALE_ASSET_CACHE)
  : path.join(root, '.next', 'cache', 'pplale-assets');

/** Number of images to render at the same time. Sharp already uses a few threads per image. */
export const concurrency = Math.max(1, Number(process.env.PPLALE_IMAGE_CONCURRENCY) || Math.min(4, availableParallelism()));

export function digest(...parts) {
  const hash = createHash('sha256');
  for (const part of parts) hash.update(part).update('\0');
  return hash.digest('hex').slice(0, 16);
}

/** Cache keys include the generator source, so editing a script invalidates only what it produced. */
export function sourceSignature(importMetaUrl) {
  return readFile(fileURLToPath(importMetaUrl)).then(bytes => digest(bytes));
}

async function exists(file) {
  try {
    return (await stat(file)).size > 0;
  } catch {
    return false;
  }
}

/**
 * Run `generate` only when the cached file is missing. The result is written next to the cache
 * entry first, so an interrupted build never leaves a half-written file behind.
 * Returns true when the image was rendered.
 */
export async function cached(file, generate) {
  if (await exists(file)) return false;
  await mkdir(path.dirname(file), { recursive: true });
  const extension = path.extname(file);
  const temp = extension ? `${file.slice(0, -extension.length)}.tmp-${process.pid}${extension}` : `${file}.tmp-${process.pid}`;
  try {
    await generate(temp);
    await rename(temp, file);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
  return true;
}

/**
 * Publish a cached file into `public/`. A hard link costs nothing; Docker cache mounts live on
 * another filesystem, so fall back to a copy there.
 */
export async function publish(cachedFile, target) {
  await mkdir(path.dirname(target), { recursive: true });
  await rm(target, { force: true });
  try {
    await link(cachedFile, target);
  } catch {
    await copyFile(cachedFile, target);
  }
}

/** Drop cached variants that no longer match the current sources. */
export async function prune(directory, keep) {
  let names;
  try {
    names = await readdir(directory);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of names) {
    if (keep.has(name) || !/\.(png|webp|avif)$/.test(name)) continue;
    await rm(path.join(directory, name), { force: true });
    removed++;
  }
  return removed;
}
