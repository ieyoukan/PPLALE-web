import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'public/game-assets/cards');
await mkdir(output, { recursive: true });
const cards = [];
for (const [file, key] of [['yojo', 'yojo'], ['sweet', 'sweet'], ['playable', 'playable'], ['tokenYojo', 'tokenYojo'], ['token', 'token']]) {
  cards.push(...JSON.parse(await readFile(path.join(root, `src/data/${file}.json`), 'utf8'))[key]);
}
const assets = {};
for (const card of cards) {
  const source = await readFile(path.join(root, 'public', card.imageUrl));
  const digest = createHash('sha256').update('game-card-640-webp82-avif50-v1:').update(source).digest('hex').slice(0, 16);
  const formats = {};
  for (const format of ['webp', 'avif']) {
    const filename = `${card.id}-${digest}.${format}`;
    try { await readFile(path.join(output, filename)); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const image = sharp(source).resize({ width: 640, withoutEnlargement: true });
      await (format === 'avif' ? image.avif({ quality: 50, effort: 4, chromaSubsampling: '4:4:4' }) : image.webp({ quality: 82 })).toFile(path.join(output, filename));
    }
    formats[format] = `/game-assets/cards/${filename}`;
  }
  assets[card.id] = formats;
}
const active = new Set(Object.values(assets).flatMap(formats => Object.values(formats).map(src => path.basename(src))));
for (const filename of await readdir(output)) if (/\.(webp|avif)$/.test(filename) && !active.has(filename)) await unlink(path.join(output, filename));
const probe = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#fff' } }).avif().toBuffer();
await mkdir(path.join(root, 'src/lib/game/generated'), { recursive: true });
await writeFile(path.join(root, 'src/lib/game/generated/card-assets.json'), `${JSON.stringify({ cards: assets, avifProbe: `data:image/avif;base64,${probe.toString('base64')}` })}\n`);
console.log(`Game card assets: ${Object.keys(assets).length} (shared by board, hand and enlarged view)`);
