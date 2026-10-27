import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { cacheRoot, cached, concurrency, digest, prune, publish, root, sourceSignature } from './lib/asset-cache.mjs';

const SETTINGS = 'game-card-640-webp82-avif50-v2';
const version = await sourceSignature(import.meta.url);
const output = path.join(root, 'public/game-assets/cards');
const cacheDir = path.join(cacheRoot, 'game-assets/cards');
const cards = [];
for (const [file, key] of [['yojo', 'yojo'], ['sweet', 'sweet'], ['playable', 'playable'], ['tokenYojo', 'tokenYojo'], ['token', 'token']]) {
  cards.push(...JSON.parse(await readFile(path.join(root, `src/data/${file}.json`), 'utf8'))[key]);
}

const assets = new Array(cards.length);
const keep = new Set();
let index = 0;
async function render() {
  while (index < cards.length) {
    const position = index++;
    const card = cards[position];
    const source = await readFile(path.join(root, 'public', card.imageUrl));
    const hash = digest(SETTINGS, version, source);
    const formats = {};
    for (const format of ['webp', 'avif']) {
      const filename = `${card.id}-${hash}.${format}`;
      const cachedFile = path.join(cacheDir, filename);
      keep.add(filename);
      await cached(cachedFile, temp => {
        const image = sharp(source).resize({ width: 640, withoutEnlargement: true });
        return format === 'avif'
          ? image.avif({ quality: 50, effort: 3, chromaSubsampling: '4:4:4' }).toFile(temp)
          : image.webp({ quality: 82 }).toFile(temp);
      });
      await publish(cachedFile, path.join(output, filename));
      formats[format] = `/game-assets/cards/${filename}`;
    }
    assets[position] = formats;
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, cards.length) }, render));

await prune(output, keep);
await prune(cacheDir, keep);

const probe = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#fff' } }).avif().toBuffer();
const target = path.join(root, 'src/lib/game/generated/card-assets.json');
const contents = `${JSON.stringify({ cards: Object.fromEntries(cards.map((card, position) => [card.id, assets[position]])), avifProbe: `data:image/avif;base64,${probe.toString('base64')}` })}\n`;
await mkdir(path.dirname(target), { recursive: true });
// Keep the timestamp stable so dev servers do not recompile identical asset maps.
if (await readFile(target, 'utf8').catch(() => null) !== contents) await writeFile(target, contents);
console.log(`Game card assets: ${cards.length} (shared by board, hand and enlarged view)`);
