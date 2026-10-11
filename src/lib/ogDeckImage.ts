import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { allPlayableCards, allSweetCards, allYojoCards } from '@/data/cards';
import type { CardInfo } from '@/types/card';

const WIDTH = 1200;
const HEIGHT = 630;
const MAX_CACHE_BYTES = 32 * 1024 * 1024;
const cards = new Map([...allYojoCards, ...allSweetCards, ...allPlayableCards].map(card => [card.id, card]));
const assets = new Map<string, Promise<Buffer>>();
const images = new Map<string, Buffer>();
const pending = new Map<string, Promise<Buffer>>();
let cacheBytes = 0;
let activeRenders = 0;
const waiting: Array<() => void> = [];
let caption: Promise<Buffer> | undefined;
let background: Promise<Buffer> | undefined;

const yojoPosition = (i: number) => ({ left: (i % 5) * 104, top: Math.floor(i / 5) * 154, width: 100, height: 150 });
const sweetPosition = (i: number) => ({ left: 548 + (i % 5) * 129, top: Math.floor(i / 5) * 184, width: 120, height: 180 });
const ids = (value: unknown, type: CardInfo['type'], count: number): string[] => Array.isArray(value)
  ? value.filter((id): id is string => typeof id === 'string' && cards.get(id)?.type === type).slice(0, count).sort((a, b) => a.localeCompare(b, 'ja', { numeric: true })) : [];

function cardImage(id: string, width: number, height: number): Promise<Buffer> {
  const key = `${id}:${width}:${height}`;
  const cached = assets.get(key);
  if (cached) return cached;
  // Paths come only from the bundled catalog. No network request is needed to read a card.
  const path = cards.get(id)!.imageUrl.replace(/^\/images\//, 'og-cards/').replace(/\.webp$/i, '.png');
  const result = readFile(join(process.cwd(), 'public', path)).then(bytes => sharp(bytes).resize(width, height, { fit: 'fill' }).png({ compressionLevel: 1 }).toBuffer());
  assets.set(key, result);
  result.catch(() => assets.delete(key));
  return result;
}

function template(): Promise<Buffer> {
  if (!background) {
    const positions = [...Array.from({ length: 20 }, (_, i) => yojoPosition(i)), ...Array.from({ length: 10 }, (_, i) => sweetPosition(i))];
    const rectangles = positions.map(p => `<rect x="${p.left}" y="${p.top}" width="${p.width}" height="${p.height}" fill="#eee"/>`).join('');
    background = sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"><rect width="100%" height="100%" fill="#fffbe7"/>${rectangles}</svg>`)).png().toBuffer();
    background.catch(() => { background = undefined; });
  }
  return background;
}

function hashtag(): Promise<Buffer> {
  if (!caption) {
    caption = readFile(join(process.cwd(), 'public', 'og-cards', 'caption.png'));
    caption.catch(() => { caption = undefined; });
  }
  return caption;
}

async function render(yojo: string[], sweet: string[], playable: string | null): Promise<Buffer> {
  // Limit native rendering concurrency, while allowing identical requests to share one job.
  if (activeRenders >= 2) await new Promise<void>(resolve => waiting.push(resolve));
  else activeRenders++;
  try {
    const layers = await Promise.all([
      ...yojo.map(async (id, i) => ({ input: await cardImage(id, 100, 150), left: yojoPosition(i).left, top: yojoPosition(i).top })),
      ...sweet.map(async (id, i) => ({ input: await cardImage(id, 120, 180), left: sweetPosition(i).left, top: sweetPosition(i).top })),
      ...(playable ? [cardImage(playable, 176, 264).then(input => ({ input, left: 548, top: 366 }))] : []),
      hashtag().then(input => ({ input, left: 720, top: 558 })),
    ]);
    return await sharp(await template()).composite(layers).png({ compressionLevel: 1 }).toBuffer();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else activeRenders--;
  }
}

/** Cache by card content rather than signature timestamp, so fresh share URLs reuse the PNG. */
export async function getOgDeckImage(data: Record<string, unknown>): Promise<{ bytes: Buffer; etag: string }> {
  const yojo = ids(data.yojoDeckIds, 'yojo', 20);
  const sweet = ids(data.sweetDeckIds, 'sweet', 10);
  const playable = typeof data.playableCardId === 'string' && cards.get(data.playableCardId)?.type === 'playable' ? data.playableCardId : null;
  const key = createHash('sha256').update(JSON.stringify(['og-v2', yojo, sweet, playable])).digest('hex');
  let bytes = images.get(key);
  if (bytes) { images.delete(key); images.set(key, bytes); }
  else {
    let job = pending.get(key);
    if (!job) {
      job = render(yojo, sweet, playable).then(result => {
        while (images.size && cacheBytes + result.byteLength > MAX_CACHE_BYTES) {
          const oldest = images.keys().next().value!;
          cacheBytes -= images.get(oldest)!.byteLength;
          images.delete(oldest);
        }
        if (result.byteLength <= MAX_CACHE_BYTES) { images.set(key, result); cacheBytes += result.byteLength; }
        return result;
      }).finally(() => pending.delete(key));
      pending.set(key, job);
    }
    bytes = await job;
  }
  return { bytes, etag: `"${createHash('sha256').update(bytes).digest('hex')}"` };
}
