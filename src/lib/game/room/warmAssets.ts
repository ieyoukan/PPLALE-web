import { getImageProps } from 'next/image';
import { displayCards } from '../catalog';
import { BOARD_CARD_SIZES, HAND_CARD_SIZES } from '../cardImages';

const warmed = new Map<string, Promise<void>>();

function warm(id: string, sizes: string) {
  const card = displayCards[id];
  if (!card) return Promise.resolve();
  const { props } = getImageProps({ src: card.imageUrl, alt: '', fill: true, sizes });
  const key = `${props.srcSet ?? props.src}:${sizes}:${window.innerWidth}:${window.devicePixelRatio}`;
  const existing = warmed.get(key);
  if (existing) return existing;
  const image = new window.Image();
  image.decoding = 'async';
  image.fetchPriority = 'low';
  image.sizes = sizes;
  if (props.srcSet) image.srcset = props.srcSet;
  image.src = props.src;
  const ready = image.decode().catch(() => { warmed.delete(key); });
  // Cache completion, not Image objects: the browser can reclaim decoded pixels on small devices.
  if (warmed.size >= 128) warmed.delete(warmed.keys().next().value!);
  warmed.set(key, ready);
  return ready;
}

/** Only ids already known to this player. Failure never prevents a match from starting. */
export async function warmRoomCards(ids: string[], signal: AbortSignal) {
  const jobs = [...new Set(ids)].flatMap(id => [() => warm(id, HAND_CARD_SIZES), () => warm(id, BOARD_CARD_SIZES)]);
  let next = 0;
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (!signal.aborted && next < jobs.length) await jobs[next++]();
  }));
}
