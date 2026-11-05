// カードスリーブ（デッキの裏面）の画像と名前。一覧は game-core の SLEEVES、選ぶ画面は DeckQuick（DeckPopups.tsx）。
import { SLEEVES, isSleeve } from '@pplale/game-core';
import type { Sleeve } from '@pplale/game-core';

export { SLEEVES };
export type { Sleeve };

/** The image of a sleeve. The red one is the original back, kept at its old address (preloaded, cached). */
export const sleeveImage = (sleeve?: string | null): string => isSleeve(sleeve) && sleeve !== 'red' ? `/images/sleeves/${sleeve}.webp` : '/images/back-card.webp';
/** For CSS backgrounds (BoardEmulator.module.css reads --sleeve-image). */
export const sleeveBackground = (sleeve?: string | null) => `url('${sleeveImage(sleeve)}')`;
/** The names read out for each colour (the screen shows only the backs themselves). */
export const sleeveNames: Record<Sleeve, string> = { red: '赤', green: '緑', purple: '紫', pink: 'ピンク', blue: '青', brown: '茶色', teal: '青緑' };
