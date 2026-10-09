// Legal moves: every command the engine accepts for a side right now, with its result.
import { applyCommand } from '../commands/index.ts';
import { costOf } from '../core/cards.ts';
import { canAttack } from '../core/combat.ts';
import { isRevealable } from '../view.ts';
import { other, sides } from '../model.ts';
import type { Catalog, Command, GameState, Side } from '../model.ts';
import { commonSkill, skillsFor } from '../playables/skills.ts';
import { exSkillInfo } from '../playables/exSkills.ts';
import type { ExSkillId } from '../model.ts';

export interface Move {
    command: Command;
    /** State after the command (and everything it triggered) resolved. */
    next: GameState;
}

/** Sides that may send a command now. In the opening and mulligan both sides act in parallel. */
export function actingSides(s: GameState): Side[] {
    if (s.winner !== null) return [];
    if (s.pending) return [s.pending.task.actor];
    switch (s.phase) {
        case 'dice': {
            const rolls = s.dice?.rolls;
            return [!rolls || rolls.every(value => value !== null) || rolls[0] === null ? 0 : 1];
        }
        case 'opening': return sides.filter(side => s.openingRemaining[side] > 0);
        case 'mulligan': return sides.filter(side => !s.mulligan.confirmed[side]);
        default: return [s.active];
    }
}

const deckDraws = (side: Side): Command[] => [{ type: 'openingDraw', actor: side, deck: 'yojo' }, { type: 'openingDraw', actor: side, deck: 'sweet' }];

/** Keep the hand or give back any subset of the opening cards (2^n), then draw the replacements one by one. */
function mulliganCommands(s: GameState, side: Side): Command[] {
    if (s.openingRemaining[side] > 0) return deckDraws(side);
    let plans: string[][] = [[]];
    for (const uid of s.mulligan.eligible[side].filter(id => s.players[side].hand.includes(id)))
        plans = plans.flatMap(plan => [plan, [...plan, uid]]);
    return plans.map(uids => uids.length ? { type: 'mulligan', actor: side, uids } : { type: 'keep', actor: side });
}

function candidates(s: GameState, side: Side): Command[] {
    if (s.pending) return s.pending.options.map(option => ({ type: 'choose', actor: side, option: option.id }));
    const p = s.players[side];
    switch (s.phase) {
        case 'dice': return [{ type: 'roll', actor: side }];
        case 'initiative': return [{ type: 'initiative', actor: side, order: 'first' }, { type: 'initiative', actor: side, order: 'second' }];
        case 'opening': return deckDraws(side);
        case 'mulligan': return mulliganCommands(s, side);
    }
    const targets = ['leader', ...s.players[other(side)].field];
    return [
        // Field position has no rule effect, so a unit is offered once (first free slot).
        ...p.hand.map((uid): Command => ({ type: 'play', actor: side, uid })),
        ...p.field.flatMap(uid => targets.map((target): Command => ({ type: 'attack', actor: side, uid, target }))),
        ...skillsFor(p.playable).map((_, index): Command => ({ type: 'skill', actor: side, index })),
        ...(Object.keys(p.exSkills ?? {}) as ExSkillId[]).filter(id => !exSkillInfo[id].automatic && (p.exSkills![id]?.uses ?? 0) > 0).map((skill): Command => ({ type: 'exSkill', actor: side, skill })),
        ...((p.acorns ?? 0) > 0 ? (['draw', 'pp'] as const).map((mode): Command => ({ type: 'acorn', actor: side, mode })) : []),
        ...p.hand.filter(uid => isRevealable(s.cards[uid].cardId) && !s.cards[uid].revealed).map((uid): Command => ({ type: 'reveal', actor: side, uid })),
        { type: 'end', actor: side },
    ];
}

/**
 * Cheap conditions the engine also requires; they only skip hopeless candidates before the costly
 * full application, so they can never hide a legal move.
 */
function worthTrying(s: GameState, command: Command, catalog: Catalog): boolean {
    const p = s.players[command.actor];
    switch (command.type) {
        case 'attack': return canAttack(s, command.actor, command.uid, command.target, catalog);
        case 'play': return costOf(s, command.uid, catalog, command.actor) <= p.pp;
        case 'skill': return p.skills[command.index] > 0 && skillsFor(p.playable)[command.index].cost <= p.pp;
        default: return true;
    }
}

/**
 * All legal moves of `side`. Legality is decided by the engine itself (each candidate is applied),
 * so this can never disagree with the rules. Sandbox commands are not included.
 */
export function legalMoves(s: GameState, side: Side, catalog: Catalog): Move[] {
    if (!actingSides(s).includes(side)) return [];
    return candidates(s, side).filter(command => worthTrying(s, command, catalog)).flatMap(command => {
        const result = applyCommand(s, command, catalog);
        return result.error ? [] : [{ command, next: result.state }];
    });
}

/**
 * Charge only lets a unit that entered this turn attack another unit. Giving it to anyone else,
 * or when the opponent has no units, changes nothing the rules care about.
 */
function chargeUseless(s: GameState, side: Side, uid: string): boolean {
    const c = s.cards[uid];
    return !s.players[other(side)].field.length || !c || c.entered !== s.turn || c.exhausted
        || c.keywords.some(k => k === 'charge' || k === 'fast' || k === 'immobile');
}

/**
 * Legal moves the search should not spend its budget on, because they only use up something
 * (a limited skill) without any effect. The evaluation cannot always see that, and these moves
 * crowd the useful ones out of a narrow search.
 */
export function pointless(s: GameState, move: Move): boolean {
    const c = move.command;
    if (c.type === 'skill' && skillsFor(s.players[c.actor].playable)[c.index]?.name === commonSkill.name) {
        // Only the charge skill so far; it targets a unit of its own side.
        return s.players[c.actor].field.every(uid => chargeUseless(s, c.actor, uid));
    }
    const task = s.pending?.task;
    if (c.type === 'choose' && task?.op === 'keyword' && task.keyword === 'charge' && task.actor === c.actor) {
        // Picking among the targets: keep at least one so the effect can still resolve.
        return chargeUseless(s, c.actor, c.option) && s.pending!.options.some(o => !chargeUseless(s, c.actor, o.id));
    }
    return false;
}
