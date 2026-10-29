// サーバーの完全な対戦状態から、その閲覧者に見せてよい情報だけを残す。画面側は同じGameStateとして描画できる。
import { other, sides } from './model.ts';
import type { Choice, GameState, Instance, Side, Task } from './model.ts';
import { refreshDiceChoice } from './effects/diceChoice.ts';

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
 * A `spectator` sees both hands; an `audience` sees neither unrevealed hand. Both hide deck order.
 */
export function viewFor(state: GameState, viewer: Side | 'spectator' | 'audience'): GameState {
    const s: GameState = JSON.parse(JSON.stringify(state));
    refreshDiceChoice(s);
    const hidden = new Set<string>();
    for (const side of sides) {
        for (const kind of ['yojo', 'sweet'] as const) {
            for (const uid of s.players[side][kind]) hidden.add(uid);
            // The order is the secret; which cards are left is told by the count alone.
            s.players[side][kind].sort((a, b) => serialOf(a) - serialOf(b));
        }
    }
    if (viewer !== 'spectator') for (const side of sides) if (viewer === 'audience' || side === other(viewer))
        for (const uid of s.players[side].hand) if (!s.cards[uid].revealed) hidden.add(uid);
    // A unit being played is shown to both players while the answer to it (ぶらんちゃん) is awaited.
    if (s.pending?.task.op === 'playResponse' && s.pending.task.source) hidden.delete(s.pending.task.source);
    if (s.pending) {
        if (typeof viewer === 'number' && s.pending.task.actor === viewer) {
            // A search of the viewer's own deck shows the cards it offers.
            for (const { id } of s.pending.options) if (s.players[viewer].yojo.includes(id) || s.players[viewer].sweet.includes(id)) hidden.delete(id);
        } else s.pending = publicChoice(s.pending, hidden);
    }
    for (const uid of Array.from(hidden)) s.cards[uid] = blank(uid);
    s.rng = 0;
    s.queue = [];
    return s;
}

/**
 * Steps that ask a player whether to use a card from their hand in answer to the other player's action.
 * A playable's reaction skill (`skillReaction`, ちょり) is not one of them: the playable, its skills and
 * their remaining uses are public, like MP and a unit's 行動不能, so that question is shown as it is.
 */
export const handReactionOps: readonly string[] = ['attackResponses', 'eatResponse', 'turnDrawResponse', 'playResponse'];
function publicChoice({ prompt, options, task }: Choice, hidden: Set<string>): Choice {
    const { op, actor, source, text, deck, count } = task;
    const shown: Task = { op, actor, ...(source !== undefined && { source }), ...(text !== undefined && { text }), ...(deck !== undefined && { deck }), ...(count !== undefined && { count }) };
    // A choice about a card in the other player's hand (リンネ・うぃまる の手札誘発など) must not name it:
    // neither the question nor its answers are shown.
    if (handReactionOps.includes(op)) return { prompt: '相手が選択しています', options: [], task: shown };
    return { prompt: op === 'cardEffect' ? '相手がカード効果を選択しています' : prompt, options: options.filter(option => !hidden.has(option.id)), task: shown };
}
