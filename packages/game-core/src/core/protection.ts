import type { Catalog, GameState, Side } from '../model.ts';
import { other } from '../model.ts';

/** A card may have several fruit types; レンス counts as strawberry and grape (FAQ③-2). */
export function fruitsOf(s: GameState, uid: string, catalog: Catalog): string[] {
    const c = s.cards[uid];
    return Array.from(new Set([catalog[c.cardId].fruit, ...(c.cardId === 'y_60' ? ['strawberry'] : []), ...(c.fruitTypes ?? [])]));
}
export const isHidden = (s: GameState, uid: string) => s.cards[uid].keywords.includes('hide') && !!s.cards[uid].hiding;

/** Color immunity depends on the enemy unit causing the effect, including random/all effects. */
export function colorProtected(s: GameState, uid: string, actor: Side, source: string | undefined, catalog: Catalog): boolean {
    if (!source || !s.cards[source] || !s.players[other(actor)].field.includes(uid) || catalog[s.cards[source].cardId]?.type !== 'yojo') return false;
    const colors = { colorOrange: 'orange', colorStrawberry: 'strawberry', colorGrape: 'grape', colorMelon: 'melon' };
    return Object.entries(colors).some(([keyword, fruit]) => s.cards[uid].keywords.includes(keyword as keyof typeof colors) && fruitsOf(s, source, catalog).includes(fruit));
}
