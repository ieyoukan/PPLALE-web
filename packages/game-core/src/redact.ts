// What one player may know about a match played over a network. The server keeps the full state
// and sends each side only this: still a GameState, so the board draws it unchanged, but with
// everything that side cannot see blanked out.
import { other, sides } from './model.ts';
import type { Choice, GameState, Instance, Side, Task } from './model.ts';

/** `cardId` of a card the viewer cannot see. It is in no catalog; only its place and uid are known. */
export const HIDDEN_CARD = 'hidden';

const blank = (uid: string): Instance => ({
    uid, cardId: HIDDEN_CARD, attackBonus: 0, hpBonus: 0, damage: 0, costDelta: 0, temporaryCost: 0,
    keywords: [], shield: false, slot: null, entered: -1, exhausted: false, ateOn: -1, revealed: false, links: [],
});
const serialOf = (uid: string) => Number(uid.slice(1)) || 0;

/**
 * The match as `viewer` sees it. Hidden: the cards in both decks and their order (also the
 * viewer's own), the opponent's unrevealed hand, the random seed, queued effect steps, and the
 * hidden cards among the options of a choice the opponent is making.
 */
export function viewFor(state: GameState, viewer: Side): GameState {
    const s: GameState = JSON.parse(JSON.stringify(state));
    const foe = other(viewer);
    const hidden = new Set<string>();
    for (const side of sides) {
        for (const kind of ['yojo', 'sweet'] as const) {
            for (const uid of s.players[side][kind]) hidden.add(uid);
            // The order is the secret; which cards are left is told by the count alone.
            s.players[side][kind].sort((a, b) => serialOf(a) - serialOf(b));
        }
    }
    for (const uid of s.players[foe].hand) if (!s.cards[uid].revealed) hidden.add(uid);
    if (s.pending) {
        if (s.pending.task.actor === viewer) {
            // A search of the viewer's own deck shows the cards it offers.
            for (const { id } of s.pending.options) if (s.players[viewer].yojo.includes(id) || s.players[viewer].sweet.includes(id)) hidden.delete(id);
        } else s.pending = publicChoice(s.pending, hidden);
    }
    for (const uid of Array.from(hidden)) s.cards[uid] = blank(uid);
    s.rng = 0;
    s.queue = [];
    return s;
}

function publicChoice({ prompt, options, task }: Choice, hidden: Set<string>): Choice {
    const { op, actor, source, text, deck, count } = task;
    const shown: Task = { op, actor, ...(source !== undefined && { source }), ...(text !== undefined && { text }), ...(deck !== undefined && { deck }), ...(count !== undefined && { count }) };
    return { prompt, options: options.filter(option => !hidden.has(option.id)), task: shown };
}
