// Read-only helpers that tell a UI where to show things. No React / DOM here.
import { scriptOf } from './cards/registry.ts';
import { canAttack } from './core/combat.ts';
import { cardContext } from './effects/context.ts';
import { other } from './model.ts';
import type { Catalog, DeckKind, GameState, Side, TaskOp } from './model.ts';

/**
 * Where each option of the pending choice lives, so the UI can let the player pick it in place:
 * units on the field, cards in hand, deck stacks, or buttons in a tray (anything else).
 */
export interface PendingView {
    actor: Side;
    op: TaskOp;
    prompt: string;
    units: string[];
    hand: string[];
    decks: DeckKind[];
    /** `cardId` is set when the option is a card outside field / hand (e.g. a deck search). */
    buttons: { id: string; label: string; cardId?: string }[];
}

export function pendingView(s: GameState): PendingView | null {
    if (!s.pending) return null;
    const { task, prompt, options } = s.pending;
    const view: PendingView = { actor: task.actor, op: task.op, prompt, units: [], hand: [], decks: [], buttons: [] };
    for (const option of options) {
        if (task.op === 'draw' && (option.id === 'yojo' || option.id === 'sweet')) view.decks.push(option.id);
        else if (s.players.some(p => p.field.includes(option.id))) view.units.push(option.id);
        else if (s.players.some(p => p.hand.includes(option.id))) view.hand.push(option.id);
        else view.buttons.push({ ...option, cardId: s.cards[option.id]?.cardId });
    }
    return view;
}

/** Legal attack targets for each unit of `side` ('leader' = the opponent's sweets). */
export function attackTargets(s: GameState, side: Side, catalog: Catalog): Record<string, (string | 'leader')[]> {
    const result: Record<string, (string | 'leader')[]> = {};
    for (const uid of s.players[side].field) {
        const targets = (['leader', ...s.players[other(side)].field] as const).filter(target => canAttack(s, side, uid, target, catalog));
        if (targets.length) result[uid] = targets;
    }
    return result;
}

/** The card's own play condition holds (cost and field space are checked separately). */
export const canPlay = (s: GameState, side: Side, uid: string, catalog: Catalog) =>
    scriptOf(s.cards[uid].cardId).canPlay?.(cardContext(s, catalog, side, uid)) ?? true;

/** The card can be revealed from hand with the `reveal` command. */
export const isRevealable = (cardId: string) => !!scriptOf(cardId).revealable;
