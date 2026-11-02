'use client';

// 起動画面で、ゲームで使う画像と音声をまとめて先に読み込む（ブラウザのキャッシュに入れるだけで、展開はしない）。
// 1回のページ表示で1度だけ行い、終わったあとのルーム・メニュー・対戦は読み込み待ちなしで表示する。
import { useEffect, useSyncExternalStore } from 'react';
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

/** Pictures the board, the room and the chat draw as they are (not resized by next/image). */
const RAW_IMAGES = [
  '/images/back-card.webp', '/images/game/zone-frame.svg', '/images/game/counter-label.svg', '/images/game/cafe-logo.svg',
  '/images/game/wood-grain.svg', '/images/game/room-stars.webp', '/images/game/menu-bg.webp',
  ...['strawberry', 'grape', 'melon', 'orange'].map(fruit => `/images/game/fruits/${fruit}.webp`),
];
/** Pictures shown through next/image: the size each is drawn at, so the same resized file is fetched. */
const SIZED_IMAGES: { src: string; width: number; height: number; sizes?: string }[] = [
  ...['guide-01', 'guide-02', 'guide-03', 'guide-06', 'guide-07'].map(name => ({ src: `/images/game/characters/${name}.webp`, width: 720, height: 1000, sizes: '360px' })),
  ...['home-pink', 'home-purple', 'home-mint', 'home-rabbit', 'home-yellow', 'pink-friend'].map(name => ({ src: `/images/game/characters/${name}.webp`, width: 100, height: 110 })),
  { src: '/images/game/characters/home-purple.webp', width: 120, height: 132 },
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
const listeners = new Set<() => void>();
const update = (next: PreloadState) => { state = next; listeners.forEach(listener => listener()); };

/** Fetches everything once per page; a file that fails is counted and left to load when shown. */
export function preloadGame() {
  if (started) return;
  started = true;
  setTimeout(() => { if (!state.ready) update({ ...state, ready: true }); }, PRELOAD_WAIT_MS);
  void assetUrls().then(async urls => {
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
