// The API a card or skill script uses. Scripts only touch the game through this object, so the
// list below is the complete vocabulary of effects.
import { addKeyword, buff, gainPp, hit, isRealSweet, maxPp, note, spawnCard } from '../core/cards.ts';
import { heal, losePoints } from '../core/points.ts';
import type { PointLoss } from '../core/points.ts';
import { random, rollDie, shuffled } from '../core/rng.ts';
import { bounce, destroy, discard, exile, summon } from '../core/zones.ts';
import { colorProtected, fruitsOf } from '../core/protection.ts';
import { other } from '../model.ts';
import type { Catalog, DeckKind, Definition, GameState, Instance, Keyword, Player, Side, Task, TaskOp } from '../model.ts';

export interface Effects {
    readonly s: GameState;
    readonly catalog: Catalog;
    /** The side the effect works for. "friendly" / "enemy" are relative to it. */
    readonly side: Side;
    readonly foeSide: Side;
    readonly me: Player;
    readonly foe: Player;
    /** おいしくなる呪文 multiplier carried by queued steps. */
    readonly multiplier: number;
    readonly source?: string;

    /** Adds a step to the end of the queue (resolved in order, may wait for a choice). */
    queue(op: TaskOp, extra?: Partial<Task>): void;
    /** Adds a step that resolves right after the current one. */
    next(task: Task): void;
    /** Waits for the step's actor to pick one of the options; the step re-runs with `target` set. */
    ask(prompt: string, options: { id: string; label: string }[], task: Task): void;
    /** Like `ask` for card uids; labels come from the catalog. Does nothing without candidates. */
    pick(prompt: string, uids: string[], task: Task): void;

    buff(uid: string, attack: number, hp: number): void;
    addKeyword(uid: string, keyword: Keyword): void;
    /** Effect damage (blocked by effectImmune). */
    damage(uid: string, amount: number): void;
    /** Effect destruction (blocked by effectImmune). */
    destroy(uid: string): void;
    exile(uid: string, owner?: Side): void;
    bounce(uid: string): void;
    protected(uid: string): boolean;
    fruits(uid: string): string[];
    /** Rolls through a queued step so レンテ can choose its value, then resumes with task.value. */
    die(resume: Task): void;
    summon(cardId: string): string | undefined;
    /** Creates a card outside every zone; the caller places it. */
    spawn(cardId: string): string;
    shuffleDeck(kind: DeckKind): void;
    discard(uid: string, side?: Side): void;
    heal(amount: number, side?: Side): void;
    losePoints(side: Side, amount: number, mode: PointLoss): number;
    eat(uid: string, amount: number): void;
    gainPp(amount: number): void;
    maxPp(): number;
    random(size: number): number;
    /** Rolls a six-sided die and records it so the UI can show the roll. */
    rollDie(): number;
    note(text: string): void;
    defOf(uid: string): Definition;
    /** Whether `cardId` was played from hand earlier this game (not counting the current card). */
    playedBefore(cardId: string): boolean;
    isRealSweet(uid: string): boolean;
}

/** Context for a card's own hooks; `uid` is that card. */
export interface CardContext extends Effects {
    readonly uid: string;
    readonly card: Instance;
    readonly def: Definition;
}

export function effects(s: GameState, catalog: Catalog, side: Side, source?: string, multiplier = 1, blockedTarget?: string): Effects {
    const me = s.players[side], foe = s.players[other(side)];
    const label = (uid: string) => catalog[s.cards[uid]?.cardId ?? uid]?.name ?? uid;
    const protectedTarget = (uid: string) => uid === blockedTarget || colorProtected(s, uid, side, source, catalog);
    return {
        s, catalog, side, foeSide: other(side), me, foe, multiplier, source,
        queue: (op, extra = {}) => { s.queue.push({ op, actor: side, ...(source ? { source } : {}), multiplier, ...extra }); },
        next: task => { s.queue.unshift(task); },
        ask: (prompt, options, task) => { if (options.length) s.pending = { prompt, options, task }; },
        pick: (prompt, uids, task) => { if (uids.length) s.pending = { prompt, options: uids.map(id => ({ id, label: label(id) })), task }; },
        buff: (uid, attack, hp) => { if (!protectedTarget(uid)) buff(s, uid, attack, hp); },
        addKeyword: (uid, keyword) => { if (!protectedTarget(uid)) addKeyword(s, uid, keyword); },
        damage: (uid, amount) => {
            if (protectedTarget(uid)) return;
            const extra = s.cards[uid]?.cardId === 'y_58' && !s.cards[uid].silenced && source && isRealSweet(catalog, s.cards[source].cardId) && s.players[other(side)].field.includes(uid) ? 2 : 0;
            hit(s, uid, amount > 0 ? amount + extra : amount);
        },
        destroy: uid => { if (!protectedTarget(uid)) destroy(s, uid, true, catalog); },
        exile: (uid, owner) => { if (!protectedTarget(uid)) exile(s, uid, catalog, owner); },
        bounce: uid => { if (!protectedTarget(uid)) bounce(s, uid, catalog); },
        protected: protectedTarget,
        fruits: uid => fruitsOf(s, uid, catalog),
        die: resume => { s.queue.unshift({ op: 'die', actor: side, source, resume }); },
        summon: cardId => summon(s, side, cardId, catalog),
        spawn: cardId => spawnCard(s, cardId),
        shuffleDeck: kind => { me[kind] = shuffled(s, me[kind]); },
        discard: (uid, owner = side) => discard(s, owner, uid, catalog),
        heal: (amount, target = side) => heal(s, target, amount),
        losePoints: (target, amount, mode) => losePoints(s, target, amount, mode).lost,
        eat: (uid, amount) => { s.queue.push({ op: 'eatResponse', actor: other(side), source: uid, amount }); },
        gainPp: amount => gainPp(s, side, amount),
        maxPp: () => maxPp(s, side),
        random: size => random(s, size),
        rollDie() {
            const value = rollDie(s);
            s.effectRoll = { revision: s.revision + 1, side, value, ...(source ? { cardId: s.cards[source]?.cardId } : {}) };
            return value;
        },
        note: text => note(s, text),
        defOf: uid => catalog[s.cards[uid].cardId],
        playedBefore: cardId => me.played.includes(cardId),
        isRealSweet: uid => isRealSweet(catalog, s.cards[uid].cardId),
    };
}

export function cardContext(s: GameState, catalog: Catalog, side: Side, uid: string, multiplier = 1, blockedTarget?: string): CardContext {
    const card = s.cards[uid];
    return { ...effects(s, catalog, side, uid, multiplier, blockedTarget), uid, card, def: catalog[card.cardId] };
}
