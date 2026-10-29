// OGP・保存画像・サムネイル・デッキ確認で共用するカードの配置座標。
export const DECK_IMAGE_WIDTH = 1200;
export const DECK_IMAGE_HEIGHT = 630;
export const DECK_IMAGE_ASPECT = `${DECK_IMAGE_WIDTH} / ${DECK_IMAGE_HEIGHT}`;
export interface DeckImageCards {
  yojoDeckIds: readonly string[];
  sweetDeckIds: readonly string[];
  playableCardId: string | null;
}
export interface DeckImageSlot {
  id: string | null;
  kind: 'yojo' | 'sweet' | 'playable';
  left: number;
  top: number;
  width: number;
  height: number;
}
const ordered = (ids: readonly string[], limit: number) => ids.slice(0, limit).sort((a, b) => a.localeCompare(b, 'ja', { numeric: true }));

/** Keep every copy, sorted by card id: 5×4 yojo on the left, 5×2 sweets on the right, playable below. */
export function deckImageLayout(deck: DeckImageCards): DeckImageSlot[] {
  const yojo = ordered(deck.yojoDeckIds, 20), sweet = ordered(deck.sweetDeckIds, 10);
  return [
    ...Array.from({ length: 20 }, (_, i): DeckImageSlot => ({ id: yojo[i] ?? null, kind: 'yojo', left: i % 5 * 104, top: Math.floor(i / 5) * 154, width: 100, height: 150 })),
    ...Array.from({ length: 10 }, (_, i): DeckImageSlot => ({ id: sweet[i] ?? null, kind: 'sweet', left: 548 + i % 5 * 129, top: Math.floor(i / 5) * 184, width: 120, height: 180 })),
    { id: deck.playableCardId, kind: 'playable', left: 548, top: 366, width: 176, height: 264 },
  ];
}
