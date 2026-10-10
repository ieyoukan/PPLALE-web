// Playing a card from hand once nothing stops it: pay, place, trigger. The `play` command checks that
// it is legal; an answer from the other player's hand (ぶらんちゃん) is waited for in between.
import { scriptFor } from '../cards/registry.ts';
import { costOf, isRealSweet, note } from '../core/cards.ts';
import { enterField } from '../core/zones.ts';
import { cardContext } from '../effects/context.ts';
import type { Catalog, Definition, GameState, Player, Side } from '../model.ts';

/** おいしくなる呪文 (s_25): the next real sweet other than a soda gets ×(1 + casts). */
function sweetMultiplier(p: Player, def: Definition, catalog: Catalog): number {
    if (!isRealSweet(catalog, def.id) || def.sweetType === 'animal_soda' || !p.sweetBoost) return 1;
    const multiplier = 1 + p.sweetBoost;
    p.sweetBoost = 0;
    return multiplier;
}

/**
 * ぶらんちゃん in `side`'s hand, usable against a unit the other player plays: it goes out of the game
 * with two more hand cards, so three are needed.
 */
export function playAnswers(s: GameState, side: Side): string[] {
    const hand = s.players[side].hand;
    return hand.length >= 3 ? hand.filter(uid => s.cards[uid].cardId === 'y_109' && !s.cards[uid].silenced) : [];
}

export function commitPlay(s: GameState, actor: Side, uid: string, slot: number, catalog: Catalog) {
    const p = s.players[actor], card = s.cards[uid], def = catalog[card.cardId], cost = costOf(s, uid, catalog, actor);
    p.pp -= cost;
    p.hand = p.hand.filter(id => id !== uid);
    note(s, `${p.name}：「${def.name}」をプレイ（${cost}PP）`);
    if (def.type === 'yojo') {
        enterField(s, actor, uid, catalog, true, slot);
    } else {
        p.nap.push(uid);
        scriptFor(s, uid).onPlay?.(cardContext(s, catalog, actor, uid, sweetMultiplier(p, def, catalog)));
    }
    for (const zone of ['hand', 'field'] as const) {
        for (const other of [...p[zone]].filter(id => id !== uid))
            scriptFor(s, other).onOwnerPlayed?.(cardContext(s, catalog, actor, other), uid, zone);
    }
    // Recorded after the effect, so 「既に」 conditions do not count this card.
    p.played.push(card.cardId);
}
