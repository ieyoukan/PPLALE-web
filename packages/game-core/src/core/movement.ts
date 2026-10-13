// A card that moves between zones loses what card effects gave it (user ruling): its stat changes,
// damage, cost changes, given abilities and fruit types, lost effects, links and so on — except
// when it is played from hand to the field, which keeps them (もちだ's +3/+3 in hand, レンス's
// strawberry type). Being stolen (field → field) keeps them too.
//
// Every card remembers the zone it was last seen in (`Instance.zone`). `touch` brings one card up to
// date and must be called before an effect changes a card; `syncZones` does it for all cards after
// every step (`settle`), so a card that only moved is reset as well.
import { scriptOf } from '../cards/registry.ts';
import { sides } from '../model.ts';
import type { CardZone, GameState } from '../model.ts';

export const cardZones: readonly CardZone[] = ['yojo', 'sweet', 'hand', 'field', 'nap', 'exile'];

function zoneOf(s: GameState, uid: string): CardZone | undefined {
    for (const side of sides) for (const zone of cardZones) if (s.players[side][zone].includes(uid)) return zone;
    return undefined;
}

/** What was given by effects goes; what the card itself has stays. A type given 「このゲーム中」 (ソーダ) stays too. */
function resetEffects(s: GameState, uid: string, zone: CardZone) {
    const card = s.cards[uid], script = scriptOf(card.cardId);
    for (const partner of card.links) if (s.cards[partner]) s.cards[partner].links = s.cards[partner].links.filter(id => id !== uid);
    Object.assign(card, {
        attackBonus: 0, hpBonus: 0, damage: 0, costDelta: 0, temporaryCost: 0, keywords: [...(script.keywords ?? [])],
        shield: false, links: [], exhausted: false, silenced: false, hiding: false,
    });
    if (script.evasion !== undefined) card.evasion = script.evasion;
    else delete card.evasion;
    for (const key of ['fruitTypes', 'timedFruits', 'immobileUntil', 'actions', 'destroyedBy'] as const) delete card[key];
    // A hand card shown to both players stays shown while it is in a hand.
    if (zone !== 'hand') card.revealed = false;
}

const keeps = (from: CardZone, to: CardZone) => from === to || from === 'hand' && to === 'field';

/** Call before an effect changes `uid`: a card that moved since it was last seen is reset first. */
export function touch(s: GameState, uid: string) {
    const card = s.cards[uid], now = card && zoneOf(s, uid);
    if (!now) return;
    if (card.zone && !keeps(card.zone, now)) resetEffects(s, uid, now);
    card.zone = now;
}

/** Brings every card up to date (after each step): cards that moved are reset, the rest only recorded. */
export function syncZones(s: GameState) {
    for (const side of sides) for (const zone of cardZones) for (const uid of s.players[side][zone]) {
        const card = s.cards[uid];
        if (card.zone === zone) continue;
        if (card.zone && !keeps(card.zone, zone)) resetEffects(s, uid, zone);
        card.zone = zone;
    }
}
