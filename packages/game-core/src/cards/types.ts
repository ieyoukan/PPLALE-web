import type { CardContext, Effects } from '../effects/context.ts';
import type { DeckKind, GameState, Keyword, Side, Task, TaskOp } from '../model.ts';

/**
 * A queued effect step. Generic ones are in effects/ops.ts; a card or skill may declare its own
 * in `ops` when the step only makes sense for it.
 */
export interface OpDef {
    /**
     * `unit`: the step needs one unit on the field, chosen from `task.scope`, narrowed by enemy taunt. The engine asks for it, then `run` sees `task.target` set.
     */
    target?: 'unit';
    run(fx: Effects, task: Task): void;
    /** Optional CPU preference among the pending option ids. */
    cpu?(fx: Effects, task: Task, options: string[]): string | undefined;
}
export type OpTable = Partial<Record<TaskOp, OpDef>>;

export interface DrawEvent {
    kind: DeckKind;
    /** Drawn card, or undefined when the deck was empty. */
    uid?: string;
    /** Every card drawn so far by this step (including repeats). */
    drawn: string[];
    /** True on the last draw of the step. */
    done: boolean;
}

/**
 * Everything a card does, keyed by when it happens. A hook is only called for the card it belongs
 * to; `ctx.uid` is that card. Hooks either act immediately (ctx.buff, ctx.heal …) or queue steps
 * (ctx.queue) that resolve in order and may wait for the player's choice.
 */
export interface CardScript {
    /** Printed keywords (常在能力). */
    keywords?: Keyword[];
    /** Overrides the printed cost while in hand. */
    baseCost?(s: GameState, side: Side): number | undefined;
    /** The card can be revealed from hand at any time. */
    revealable?: boolean;
    /** 手札から場に出たとき（幼女）／使ったとき（お菓子）. */
    onPlay?(ctx: CardContext): void;
    /** 場に出たとき, however it entered (hand, summon, steal). Runs before onPlay. */
    onEnter?(ctx: CardContext): void;
    /** While this unit is on the field, another friendly unit entered. */
    onAllyEnter?(ctx: CardContext, ally: string): void;
    /** 破壊されたとき. The card is already in the nap. */
    onDestroyed?(ctx: CardContext): void;
    /** 手札から直接お昼寝場所に捨てられたとき. */
    onDiscarded?(ctx: CardContext): void;
    /** 攻撃時, before combat damage. */
    onAttack?(ctx: CardContext, target: string | 'leader'): void;
    /** The owner played a card while this one is in their hand or on their field. */
    onOwnerPlayed?(ctx: CardContext, played: string, zone: 'hand' | 'field'): void;
    /** A draw step queued by this card resolved one card. */
    onDrawn?(ctx: CardContext, draw: DrawEvent): void;
    /** Steps only this card uses. */
    ops?: OpTable;
    cpu?: {
        /** False when playing it now would waste it (e.g. no target). */
        worthPlaying?(ctx: CardContext): boolean;
    };
}
export type CardScripts = Record<string, CardScript>;
