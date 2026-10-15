import type { Catalog, GameState, Side } from '../model.ts';
import { other, sides } from '../model.ts';

/** Where a side's 幼女 have the types its ソーダ gave (not the exile). */
const lastingZones = ['field', 'hand', 'yojo', 'nap'] as const;

/**
 * A card may have several fruit types; レンス counts as strawberry and grape (FAQ③-2). Types given for a while
 * count until their last turn; the ones ソーダ gives, while the 幼女 is in that side's field, hand, deck or nap.
 */
export function fruitsOf(s: GameState, uid: string, catalog: Catalog): string[] {
    const c = s.cards[uid];
    const timed = Object.keys(c.timedFruits ?? {}).filter(fruit => c.timedFruits![fruit] >= s.turn);
    const lasting = catalog[c.cardId].type !== 'yojo' ? [] : sides.flatMap(side => {
        const p = s.players[side];
        return p.lastingFruits?.length && lastingZones.some(zone => p[zone].includes(uid)) ? p.lastingFruits : [];
    });
    return Array.from(new Set([catalog[c.cardId].fruit, ...(c.cardId === 'y_60' ? ['strawberry'] : []), ...(c.fruitTypes ?? []), ...lasting, ...timed]));
}
export const isHidden = (s: GameState, uid: string) => s.cards[uid].keywords.includes('hide') && !!s.cards[uid].hiding;

/** Color immunity depends on the enemy unit causing the effect, including random/all effects. */
export function colorProtected(s: GameState, uid: string, actor: Side, source: string | undefined, catalog: Catalog): boolean {
    if (!source || !s.cards[source] || !s.players[other(actor)].field.includes(uid) || catalog[s.cards[source].cardId]?.type !== 'yojo') return false;
    const colors = { colorOrange: 'orange', colorStrawberry: 'strawberry', colorGrape: 'grape', colorMelon: 'melon' };
    return Object.entries(colors).some(([keyword, fruit]) => s.cards[uid].keywords.includes(keyword as keyof typeof colors) && fruitsOf(s, source, catalog).includes(fruit));
}
