import { gameCardSource, prepareGameCardFormat } from '../matchAssets';

const warmed = new Map<string, Promise<void>>();
const fetched = new Map<string, Promise<void>>();
export type AssetProgress = { done: number; total: number };

/** Cache compressed bytes in the background without expanding the entire card pool into pixels. */
function prefetch(src: string) {
  let pending = fetched.get(src);
  if (!pending) {
    pending = fetch(src, { cache: 'force-cache', priority: 'low', signal: AbortSignal.timeout(30_000) }).then(async response => {
      if (!response.ok) throw new Error('画像を準備できませんでした。もう一度お試しください');
      await response.arrayBuffer();
    }).catch(error => { fetched.delete(src); throw error; });
    fetched.set(src, pending);
  }
  return pending;
}

function warm(src: string, decode: boolean) {
  if (!decode) return warmed.get(src) ?? prefetch(src);
  const existing = warmed.get(src);
  if (existing) return existing;
  const ready = (fetched.get(src) ?? Promise.resolve()).catch(() => {}).then(() => new Promise<void>((resolve, reject) => {
    const image = new window.Image();
    const timeout = setTimeout(() => { image.removeAttribute('src'); reject(new Error('画像を準備できませんでした。接続を確認して、もう一度お試しください')); }, 30_000);
    image.decoding = 'async';
    image.src = src;
    image.decode().then(resolve, () => reject(new Error('画像を準備できませんでした。もう一度お試しください'))).finally(() => clearTimeout(timeout));
  })).catch(error => { warmed.delete(src); throw error; });
  // Keep completion, not decoded Image objects, so mobile devices can reclaim pixels.
  warmed.set(src, ready);
  return ready;
}

/** Same URLs at every card size: no second request when a card moves or is enlarged. */
export async function warmRoomCards(ids: string[], signal?: AbortSignal, progress?: (value: AssetProgress) => void, decode = true) {
  await prepareGameCardFormat();
  const sources = [...new Set([
    '/images/back-card.webp', '/images/game/zone-frame.svg', '/images/game/counter-label.svg', '/images/game/cafe-logo.svg',
    ...ids.map(gameCardSource).filter((src): src is string => !!src),
  ])];
  let next = 0, done = 0, failed = false;
  progress?.({ done, total: sources.length });
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (!failed && next < sources.length) {
      signal?.throwIfAborted();
      try { await warm(sources[next++], decode); } catch (error) { failed = true; throw error; }
      if (!failed && !signal?.aborted) progress?.({ done: ++done, total: sources.length });
    }
  }));
  signal?.throwIfAborted();
}
