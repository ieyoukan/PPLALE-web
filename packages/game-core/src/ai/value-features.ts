import { MAX_PP } from '../core/constants.ts';
// Legacy v1 tensor encoding. Heuristic scores are explicit inputs supplied by the adapter.
// New research uses gameplay/observation.ts and research/encode.ts instead.
import { attackOf, costOf, hpOf, maxPp } from '../core/cards.ts';
import { other } from '../model.ts';
import type { Catalog, GameState, Keyword, Side } from '../model.ts';

/**
 * One side's features: what both players can see, then what only the owner knows (its hand).
 * Deliberately no card names: with them the network predicted winners better (it learned which
 * decks are strong) but chose worse moves, because holding a strong card looked better than playing it.
 */
const PUBLIC = 36, FULL = PUBLIC + 3;
/** `full`: features per side. `inputs`: a side's own features followed by the public ones of the other. */
export const valueLayout = { full: FULL, public: PUBLIC, inputs: FULL + PUBLIC } as const;

/** Features of `side`. `plan` is `evaluatePlan(s, side)`, passed in because both sides share it. */
function sideFeatures(s: GameState, side: Side, catalog: Catalog, plan: number, damage: number, f: Float32Array) {
    const p = s.players[side], foe = s.players[other(side)], active = s.active === side;
    const kind = (uid: string) => catalog[s.cards[uid].cardId].type;
    const pp = maxPp(s, side);
    f[0] = p.points / 12;
    f[1] = Math.max(0, 5 - p.points) / 5;
    f[2] = p.points <= 2 ? 1 : 0;
    f[3] = (p.maxPoints - p.points) / 12;
    f[4] = p.shield ? 1 : 0;
    f[5] = active ? 1 : 0;
    f[6] = active ? p.pp / 12 : 0;
    f[7] = pp / 12;
    f[8] = p.turns / 12;
    f[9] = p.nextPpDebt / 4;
    f[10] = s.rules.firstPlayer === side ? 1 : 0;
    f[11] = p.hand.length / 10;
    f[12] = p.hand.filter(uid => kind(uid) === 'yojo').length / 10;
    f[13] = p.yojo.length / 20;
    f[14] = p.sweet.length / 10;
    f[15] = p.field.length / 5;
    for (const uid of p.field) {
        const c = s.cards[uid], attack = attackOf(c, catalog), hp = Math.max(0, hpOf(c, catalog));
        const has = (keyword: Keyword) => c.keywords.includes(keyword);
        f[16] += attack / 10;
        f[17] += hp / 10;
        f[18] = Math.max(f[18], attack / 6);
        if (has('guard')) { f[19] += 1 / 3; f[20] += hp / 10; }
        if (has('taunt')) f[21] += 1 / 3;
        if (has('pierce')) f[22] += attack / 6;
        if (!c.exhausted && !has('immobile') && (c.entered !== s.turn || has('fast'))) f[23] += attack / 10;
        if (c.exhausted) f[24] += 1 / 5;
        if (has('immobile')) f[25] += 1 / 3;
        if (has('effectImmune')) f[26] += 1 / 3;
        if (c.shield) f[27] += 1 / 3;
        if (has('fast') || has('charge')) f[28] += 1 / 3;
    }
    f[29] = p.skills.reduce((sum, uses) => sum + uses, 0) / 4;
    f[30] = p.sweetBoost / 2;
    f[31] = p.nap.length / 20;
    f[32] = damage / 12;
    f[33] = damage >= foe.points ? 1 : 0;
    f[34] = s.pending?.task.actor === side ? 1 : 0;
    f[35] = p.hand.filter(uid => s.cards[uid].revealed).length / 5;
    // Only the owner knows these. For the other side they come from a guessed hand (see determinize).
    const budget = active ? p.pp : Math.min(MAX_PP, pp + 1);
    for (const uid of p.hand) {
        const cost = costOf(s, uid, catalog, side);
        f[PUBLIC] += cost / 30;
        if (cost <= budget) f[PUBLIC + 1] += 1 / 5;
    }
    f[PUBLIC + 2] = plan / 100;
}

/**
 * Both sides' features, side 0 first, `valueLayout.full` each. The network input for a side is its
 * own features followed by the first `valueLayout.public` features of the other side.
 */
export function legacyValueFeatures(s: GameState, catalog: Catalog, derived: { plan: number; pressure: [number, number] }): Float32Array {
    const out = new Float32Array(FULL * 2);
    sideFeatures(s, 0, catalog, derived.plan, derived.pressure[0], out.subarray(0, FULL));
    sideFeatures(s, 1, catalog, -derived.plan, derived.pressure[1], out.subarray(FULL));
    return out;
}

