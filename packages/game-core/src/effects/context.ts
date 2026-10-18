// The API a card or skill script uses. Scripts only touch the game through this object, so the
// list below is the complete vocabulary of effects.
import { touch } from '../core/movement.ts';
import { decideMatch } from '../core/outcome.ts';
import { addKeyword, availablePpMaximum, buff, gainPp, giveEvasion, hit, immobilize, increasePp, isRealSweet, note, spawnCard, swapStats } from '../core/cards.ts';
import { gainMp } from '../playables/usage.ts';
import { heal, losePoints } from '../core/points.ts';
import type { PointLoss } from '../core/points.ts';
import { random, rollDie, shuffled } from '../core/rng.ts';
import { bounce, destroy, discard, exile, reveal, summon, toDeck } from '../core/zones.ts';
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

    /**
     * Adds a step after the ones this effect already queued (resolved in order, may wait for a choice).
     * Steps queued while a step runs resolve before the steps that were already waiting (resolve.ts).
     */
    queue(op: TaskOp, extra?: Partial<Task>): void;
    /** Adds a step that resolves right after the current one. */
    next(task: Task): void;
    /** Waits for the step's actor to pick one of the options; the step re-runs with `target` set. */
    ask(prompt: string, options: { id: string; label: string }[], task: Task): void;
    /** Like `ask` for card uids; labels come from the catalog. Does nothing without candidates. */
    pick(prompt: string, uids: string[], task: Task): void;

    buff(uid: string, attack: number, hp: number): void;
    addKeyword(uid: string, keyword: Keyword): void;
    /** おにごっこ(1d6≧X); a unit that already has one keeps the stronger. */
    giveEvasion(uid: string, x: number): void;
    /** 行動不能 for a time: the unit cannot act up to the end of game turn `until`. */
    immobilize(uid: string, until: number): void;
    /** Effect damage (blocked by effectImmune). */
    damage(uid: string, amount: number): void;
    /** Effect destruction (blocked by effectImmune). */
    destroy(uid: string): void;
    exile(uid: string, owner?: Side): void;
    bounce(uid: string): void;
    /** Swaps the unit's attack and HP. */
    swapStats(uid: string): void;
    /** Gives a fruit type; with `until`, only up to the end of that game turn. */
    addFruit(uid: string, fruit: string, until?: number): void;
    /** A card in hand / on the field / in the nap goes back into its owner's deck as the printed card; the deck is shuffled. */
    toDeck(uid: string): void;
    /** Shows a hand card to both players; fires 「公開されたとき」 once. */
    reveal(uid: string): void;
    /**
     * Call before changing a card directly (its cost, types …): a card that moved since it was last
     * seen first loses what effects gave it (core/movement.ts). buff / addKeyword … already do.
     */
    touch(uid: string): void;
    protected(uid: string): boolean;
    fruits(uid: string): string[];
    /** Rolls through a queued step so レンテ can choose its value, then resumes with task.value. */
    die(resume: Task): void;
    /** `silenced`: 全ての能力を失った状態で. */
    summon(cardId: string, silenced?: boolean): string | undefined;
    /** Creates a card outside every zone; the caller places it. */
    spawn(cardId: string): string;
    shuffleDeck(kind: DeckKind): void;
    /** Discards hand cards to the nap; several given together are one discard (神隠し ようじょ贄). */
    discard(uids: string | string[], side?: Side): void;
    heal(amount: number, side?: Side): void;
    losePoints(side: Side, amount: number, mode: PointLoss): number;
    eat(uid: string, amount: number): void;
    /** 「PPを回復する」: up to the 最大PP; ダブルダガー adds to it. */
    gainPp(amount: number): void;
    /** 「使用できるPPを増やす」: past the 最大PP; ダブルダガー does not apply. */
    increasePp(amount: number): void;
    /** Restores MP up to the playable's maximum (nothing for a playable without MP). */
    gainMp(amount: number): void;
    /** The 最大PP a card text asks about: turn count + permanent extra, excluding extra current PP. */
    maxPp(): number;
    random(size: number): number;
    /** Rolls a six-sided die and records it so the UI can show the roll. */
    rollDie(): number;
    note(text: string): void;
    /** 特殊勝利条件: this side wins the match now. */
    win(): void;
    /** 敗北条件: this side loses the match now. */
    lose(): void;
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
        giveEvasion: (uid, x) => giveEvasion(s, uid, x),
        addKeyword: (uid, keyword) => { if (!protectedTarget(uid)) addKeyword(s, uid, keyword); },
        immobilize: (uid, until) => { if (!protectedTarget(uid)) immobilize(s, uid, until); },
        damage: (uid, amount) => {
            if (protectedTarget(uid)) return;
            const extra = s.cards[uid]?.cardId === 'y_58' && !s.cards[uid].silenced && source && isRealSweet(catalog, s.cards[source].cardId) && s.players[other(side)].field.includes(uid) ? 2 : 0;
            hit(s, uid, amount > 0 ? amount + extra : amount);
        },
        destroy: uid => { if (!protectedTarget(uid)) destroy(s, uid, true, catalog); },
        exile: (uid, owner) => { if (!protectedTarget(uid)) exile(s, uid, catalog, owner); },
        bounce: uid => { if (!protectedTarget(uid)) bounce(s, uid, catalog); },
        swapStats: uid => { if (!protectedTarget(uid)) swapStats(s, uid, catalog); },
        addFruit(uid, fruit, until) {
            const card = s.cards[uid];
            if (!card || protectedTarget(uid)) return;
            touch(s, uid);
            if (until === undefined) card.fruitTypes = Array.from(new Set([...(card.fruitTypes ?? []), fruit]));
            else card.timedFruits = { ...card.timedFruits, [fruit]: Math.max(card.timedFruits?.[fruit] ?? 0, until) };
        },
        toDeck: uid => toDeck(s, uid, catalog),
        reveal: uid => reveal(s, uid, catalog),
        touch: uid => touch(s, uid),
        protected: protectedTarget,
        fruits: uid => fruitsOf(s, uid, catalog),
        die: resume => { s.queue.unshift({ op: 'die', actor: side, source, resume }); },
        summon: (cardId, silenced) => summon(s, side, cardId, catalog, silenced),
        spawn: cardId => spawnCard(s, cardId),
        shuffleDeck: kind => { me[kind] = shuffled(s, me[kind]); },
        discard: (uids, owner = side) => discard(s, owner, uids, catalog),
        heal: (amount, target = side) => heal(s, target, amount),
        losePoints: (target, amount, mode) => losePoints(s, target, amount, mode).lost,
        eat: (uid, amount) => { s.queue.push({ op: 'eatResponse', actor: other(side), source: uid, amount }); },
        gainPp: amount => gainPp(s, side, amount),
        increasePp: amount => increasePp(s, side, amount),
        gainMp: amount => gainMp(s, side, amount),
        maxPp: () => availablePpMaximum(s, side),
        random: size => random(s, size),
        rollDie() {
            const value = rollDie(s);
            s.effectRoll = { revision: s.revision + 1, side, value, ...(source ? { cardId: s.cards[source]?.cardId } : {}) };
            return value;
        },
        note: text => note(s, text),
        win: () => decideMatch(s, side, 'special'),
        lose: () => decideMatch(s, other(side), 'defeat'),
        defOf: uid => catalog[s.cards[uid].cardId],
        playedBefore: cardId => me.played.includes(cardId),
        isRealSweet: uid => isRealSweet(catalog, s.cards[uid].cardId),
    };
}

export function cardContext(s: GameState, catalog: Catalog, side: Side, uid: string, multiplier = 1, blockedTarget?: string): CardContext {
    const card = s.cards[uid];
    return { ...effects(s, catalog, side, uid, multiplier, blockedTarget), uid, card, def: catalog[card.cardId] };
}
