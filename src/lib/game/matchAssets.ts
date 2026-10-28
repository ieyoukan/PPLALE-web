import type { Deck, GameState, MatchRules } from '@pplale/game-core';
import { displayCards } from './catalog';
import cardAssets from './generated/card-assets.json';
import tokenYojo from '@/data/tokenYojo.json';
import token from '@/data/token.json';

export const gameCardAssets: Record<string, { webp: string; avif: string }> = cardAssets.cards;
let avif = false;
let formatReady: Promise<void> | undefined;
export function prepareGameCardFormat() {
  formatReady ??= (async () => {
    const image = new window.Image();
    image.src = cardAssets.avifProbe;
    try { await image.decode(); avif = true; } catch { avif = false; }
  })();
  return formatReady;
}
export const gameCardSource = (id: string) => gameCardAssets[id]?.[avif ? 'avif' : 'webp'];
const tokens = [...tokenYojo.tokenYojo, ...token.token].map(card => card.id);

/** Only identities already revealed by the server; hidden cards never require a decoded picture. */
export function revealedMatchCardIds(state: GameState) {
  return [...new Set(Object.values(state.cards).map(card => card.cardId).filter(id => !!gameCardAssets[id]))];
}

/** CPU decks are known. Generated cards can be drawn by either side's effects. */
export function localMatchCardIds(decks: Deck[], rules?: MatchRules) {
  return [...new Set([...decks.flatMap(deck => [deck.playable, ...deck.yojo, ...deck.sweet]), ...tokens, ...roomMatchCardIds(rules)])];
}

/** Public rule-based pool only: never ask for or expose the opponent's hidden deck. */
export function roomMatchCardIds(rules?: MatchRules) {
  return Object.keys(gameCardAssets).filter(id => {
    const card = displayCards[id];
    if (!rules || tokens.includes(id)) return true;
    if (card.type === 'playable') return rules.extendedPlayable || !('version' in card) || (card.version ?? 'normal') === 'normal';
    return !card.fruit || card.fruit === 'all' || new Set<string>(rules.fruits).has(card.fruit);
  });
}
