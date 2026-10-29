import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { ROOM_CHAT_STAMPS } from '../packages/game-core/src/chatStamps.ts';
import { cacheRoot, cached, digest, prune, publish, root, sourceSignature } from './lib/asset-cache.mjs';

// 原画は公開せず、512pxの絵柄をひとつのシートにまとめて配信する。
const size = 512;
const columns = 4;
const rows = Math.ceil(ROOM_CHAT_STAMPS.length / columns);
const sources = await Promise.all(ROOM_CHAT_STAMPS.map(stamp => readFile(path.join(root, `src/assets/chat/stamps/${stamp.id}.webp`))));
const hash = digest(await sourceSignature(import.meta.url), JSON.stringify(ROOM_CHAT_STAMPS.map(stamp => stamp.id)), ...sources);
const output = path.join(root, 'public/game-assets/chat');
const cacheDir = path.join(cacheRoot, 'game-assets/chat');
const formats = {};
const keep = new Set();
let sheet;

for (const format of ['avif', 'webp']) {
  const filename = `stamps-${hash}.${format}`;
  const cachedFile = path.join(cacheDir, filename);
  keep.add(filename);
  await cached(cachedFile, async temp => {
    // キャッシュに両形式があるときは、画像の読み直し・合成を省く。
    sheet ??= await sharp({ create: { width: columns * size, height: rows * size, channels: 4, background: '#00000000' } })
      .composite(await Promise.all(sources.map(async (source, index) => ({
        input: await sharp(source).resize(size, size, { fit: 'contain', background: '#00000000' }).png().toBuffer(),
        left: index % columns * size,
        top: Math.floor(index / columns) * size,
      })))).png().toBuffer();
    const image = sharp(sheet);
    // 細い輪郭と文字の色を保つ。WebPはAVIF非対応ブラウザ用。
    await (format === 'avif'
      ? image.avif({ quality: 85, effort: 5, chromaSubsampling: '4:4:4' })
      : image.webp({ quality: 95, alphaQuality: 100, effort: 6 })).toFile(temp);
  });
  await publish(cachedFile, path.join(output, filename));
  formats[format] = `/game-assets/chat/${filename}`;
}

await prune(output, keep);
await prune(cacheDir, keep);

const manifest = path.join(root, 'src/lib/game/generated/chat-stamps.json');
const contents = `${JSON.stringify({ ...formats, size, columns, rows, ids: ROOM_CHAT_STAMPS.map(stamp => stamp.id) })}\n`;
await mkdir(path.dirname(manifest), { recursive: true });
// 同じ内容では更新せず、開発中の不要な再コンパイルを避ける。
if (await readFile(manifest, 'utf8').catch(() => null) !== contents) await writeFile(manifest, contents);
console.log(`Chat stamps: ${sources.length} (shared AVIF/WebP sheet)`);
