// What a side cannot know is replaced by a random but consistent guess before a CPU sees the state.
import { shuffled } from '../core/rng.ts';
import { cloneState } from '../core/state.ts';
import { other } from '../model.ts';
import type { Catalog, DeckKind, GameState, Side } from '../model.ts';

/**
 * A copy of `s` as `side` could imagine it:
 * - its own decks are reshuffled (it knows their contents, not their order),
 * - the opponent's unrevealed hand cards are mixed with the opponent's deck of the same kind
 *   (which deck a card was drawn from is public),
 * - the random seed is replaced, so dice and random effects cannot be predicted.
 * Everything else is public. The result is a valid state, so it can be simulated with applyCommand.
 */
export function determinize(s: GameState, side: Side, catalog: Catalog, seed: number): GameState {
    const t = cloneState(s);
    t.rng = seed >>> 0;
    const me = t.players[side], foe = t.players[other(side)];
    for (const kind of ['yojo', 'sweet'] as const) {
        // Sorted before shuffling, so the guess cannot depend on the real order or on which of the
        // cards is the one in hand (uids follow the public deck lists).
        me[kind] = shuffled(t, [...me[kind]].sort(byUid));
        const hidden = foe.hand.filter(uid => !t.cards[uid].revealed && kindOf(t, catalog, uid) === kind);
        const pool = shuffled(t, [...hidden, ...foe[kind]].sort(byUid));
        const swap = new Map(hidden.map((uid, i) => [uid, pool[i]]));
        foe.hand = foe.hand.map(uid => swap.get(uid) ?? uid);
        foe[kind] = pool.slice(hidden.length);
    }
    return t;
}

const byUid = (a: string, b: string) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
const kindOf = (s: GameState, catalog: Catalog, uid: string): DeckKind => catalog[s.cards[uid].cardId].type === 'sweet' ? 'sweet' : 'yojo';
