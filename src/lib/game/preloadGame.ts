'use client';

// 起動画面で、ゲームで使う画像と音声をまとめて先に読み込む（ブラウザのキャッシュに入れるだけで、展開はしない）。
// 1回のページ表示で1度だけ行い、終わったあとのルーム・メニュー・対戦は読み込み待ちなしで表示する。
import { useEffect, useSyncExternalStore } from 'react';
import { GUIDES } from '@/components/game/guide/GameGuide';
import { getImageProps } from 'next/image';
import { browserAppLocale } from '@/i18n/config';
import chatStamps from './generated/chat-stamps.json';
import { gameAudio, bgmUrl } from './gameAudio';
import { gameCardAssets, gameCardSource, prepareGameCardFormat } from './matchAssets';

/** `ready`: everything is in, or the launch screen has waited long enough (the rest keeps loading). */
export type PreloadState = { done: number; total: number; finished: boolean; ready: boolean };

/** At most this long on the launch screen: what is left goes on loading behind the room. */
export const PRELOAD_WAIT_MS = 30_000;
const PARALLEL = 6;

/**
 * Pictures the board and the room draw as they are (not resized by next/image). Not the starry sky (the
 * stage's own background, already loading: fetching it here too downloaded it twice) nor the large fruit
 * illustrations (only the server draws them, into link previews).
 */
const RAW_IMAGES = [
  '/images/back-card.webp', '/images/game/zone-frame.svg', '/images/game/counter-label.svg', '/images/game/cafe-logo.svg',
  '/images/game/wood-grain.svg',
];
/** Pictures shown through next/image: the size each is drawn at, so the same resized file is fetched. */
const SIZED_IMAGES: { src: string; width: number; height: number; sizes?: string }[] = [
  // The launchpad's guides (GameGuide.tsx GUIDES), drawn at 360px.
  ...GUIDES.map(guide => ({ src: `/images/game/characters/${guide.image}.webp`, width: guide.width, height: guide.height, sizes: '360px' })),
  ...['mug-gato', 'mug-shuo', 'mug-gitty', 'mug-chori', 'mug-rikusu', 'buran'].map(name => ({ src: `/images/game/characters/${name}.webp`, width: 100, height: 110 })),
  { src: '/images/game/characters/mug-shuo.webp', width: 120, height: 132 },
  { src: '/images/game/characters/friends.webp', width: 88, height: 76, sizes: '88px' },
];

/** The file the browser will pick from next/image's candidates on this screen (its pixel ratio). */
function sizedUrl({ src, width, height, sizes }: typeof SIZED_IMAGES[number]) {
  const { props } = getImageProps({ src, width, height, sizes, alt: '' });
  const candidates = (props.srcSet ?? '').split(', ').map(entry => { const [url, size] = entry.trim().split(' '); return { url, value: parseFloat(size), kind: size?.at(-1) }; }).filter(candidate => candidate.url);
  if (!candidates.length) return props.src;
  const ratio = window.devicePixelRatio || 1;
  const need = candidates[0].kind === 'w' ? parseFloat(sizes ?? `${width}`) * ratio : ratio;
  return (candidates.find(candidate => candidate.value >= need) ?? candidates.at(-1)!).url;
}

async function assetUrls() {
  await prepareGameCardFormat();
  const english = browserAppLocale() === 'en';
  const avif = gameCardSource(Object.keys(gameCardAssets)[0])?.endsWith('.avif');
  return [...new Set([
    // Music muted is not fetched (it is when turned up).
    ...(gameAudio().volume('bgm') > 0 ? [bgmUrl('home'), bgmUrl('match')] : []),
    // Every card at match size, in the language shown (tokens without an English card in Japanese).
    ...Object.keys(gameCardAssets).map(id => gameCardSource(id, english)).filter((url): url is string => !!url),
    avif ? chatStamps.avif : chatStamps.webp,
    ...RAW_IMAGES,
    ...SIZED_IMAGES.map(sizedUrl),
  ])];
}

let state: PreloadState = { done: 0, total: 0, finished: false, ready: false };
let started = false;

/** The longest the bulk download waits for the launch screen's own picture. */
const LAUNCH_PICTURE_WAIT_MS = 2500;
let markLaunchPicture: () => void = () => {};
const launchPicture = new Promise<void>(resolve => { markLaunchPicture = resolve; });
/** The launch screen's card is shown (or could not be): the bulk downloads may start. */
export function launchPictureShown() { markLaunchPicture(); }
/**
 * Resolves once the launch screen's card is in, or after LAUNCH_PICTURE_WAIT_MS. Started beside it, the
 * game's hundreds of files shared a slow line with that one picture, the largest of the screen, and held it back.
 */
export const afterLaunchPicture = () => Promise.race([launchPicture, new Promise<void>(resolve => setTimeout(resolve, LAUNCH_PICTURE_WAIT_MS))]);
const listeners = new Set<() => void>();
const update = (next: PreloadState) => { state = next; listeners.forEach(listener => listener()); };

/** Fetches everything once per page; a file that fails is counted and left to load when shown. */
export function preloadGame() {
  if (started) return;
  started = true;
  // Room for the page's own timings after these hundreds of files (the browser keeps 250 by default, then drops
  // the rest: what the page loads later would go unmeasured, e.g. by Speed Insights).
  performance.setResourceTimingBufferSize(1500);
  setTimeout(() => { if (!state.ready) update({ ...state, ready: true }); }, PRELOAD_WAIT_MS);
  void afterLaunchPicture().then(assetUrls).then(async urls => {
    let next = 0, done = 0;
    update({ ...state, done, total: urls.length });
    await Promise.all(Array.from({ length: PARALLEL }, async () => {
      while (next < urls.length) {
        const url = urls[next++];
        await fetch(url, { cache: 'force-cache', priority: 'low' }).then(response => response.arrayBuffer()).catch(() => {});
        update({ ...state, done: ++done });
      }
    }));
    update({ ...state, finished: true, ready: true });
  }, () => update({ ...state, finished: true, ready: true }));
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const server: PreloadState = { done: 0, total: 0, finished: false, ready: false };
/** How far the preload is; the first screen that asks starts it. */
export function usePreload() {
  useEffect(preloadGame, []);
  return useSyncExternalStore(subscribe, () => state, () => server);
}
