// Shared legal actions: every command the engine accepts for a side right now, with its result.
import { applyCommand } from '../commands/index.ts';
import { actingSides } from '../core/actions.ts';
export { actingSides, actionCost } from '../core/actions.ts';
export type { ActionCost } from '../core/actions.ts';
import { costOf } from '../core/cards.ts';
import { canAttack } from '../core/combat.ts';
import { isRevealable } from '../view.ts';
import { other } from '../model.ts';
import type { Catalog, Command, GameState, Side } from '../model.ts';
import { skillAt, skillCount, skillPrice, skillsFor } from '../playables/skills.ts';
import { exSkillInfo } from '../playables/exSkills.ts';
import type { ExSkillId } from '../model.ts';

export interface LegalAction {
    command: Command;
    /** State after the command (and everything it triggered) resolved. */
    next: GameState;
}

export const commandKey = (command: Command) => JSON.stringify(Object.entries(command).sort(([a], [b]) => a.localeCompare(b)));

const deckDraws = (side: Side): Command[] => [{ type: 'openingDraw', actor: side, deck: 'yojo' }, { type: 'openingDraw', actor: side, deck: 'sweet' }];

/** Keep the hand or give back any subset of the opening cards (2^n), then draw the replacements one by one. */
function mulliganCommands(s: GameState, side: Side): Command[] {
    if (s.openingRemaining[side] > 0) return deckDraws(side);
    let plans: string[][] = [[]];
    for (const uid of s.mulligan.eligible[side].filter(id => s.players[side].hand.includes(id)))
        plans = plans.flatMap(plan => [plan, [...plan, uid]]);
    return plans.map(uids => uids.length ? { type: 'mulligan', actor: side, uids } : { type: 'keep', actor: side });
}

export function actionCandidates(s: GameState, side: Side): Command[] {
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
        ...Array.from({ length: skillCount(p) }, (_, index): Command => ({ type: 'skill', actor: side, index })),
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
        case 'skill': {
            // Uses left (when it has a limit), and its current cost in PP and MP; reaction skills are never commands.
            const taken = skillAt(p, command.index);
            if (taken?.extra !== undefined) return p.extraSkills![taken.extra].uses > 0 && taken.skill.cost <= p.pp;
            const skill = skillsFor(p.playable)[command.index], price = skillPrice(p, command.index, catalog);
            return !skill.reaction && (skill.uses === undefined || p.skills[command.index] > 0) && price.pp <= p.pp && price.mp <= (p.mp ?? 0);
        }
        default: return true;
    }
}

/**
 * All legal moves of `side`. Legality is decided by the engine itself (each candidate is applied),
 * so this can never disagree with the rules. Sandbox commands are not included.
 */
export function legalActions(s: GameState, side: Side, catalog: Catalog): LegalAction[] {
    const candidates = offeredCandidates(s, side);
    return candidates.filter(command => worthTrying(s, command, catalog)).flatMap(command => {
        const result = applyCommand(s, command, catalog);
        return result.error ? [] : [{ command, next: result.state }];
    });
}

function offeredCandidates(s: GameState, side: Side): Command[] {
    if (actingSides(s).includes(side)) return actionCandidates(s, side);
    // Revealing is optional, including during the opponent's turn; it does not transfer priority.
    if (s.winner !== null || s.phase !== 'playing' || s.pending) return [];
    return s.players[side].hand.filter(uid => isRevealable(s.cards[uid].cardId) && !s.cards[uid].revealed)
        .map(uid => ({ type: 'reveal', actor: side, uid }));
}

/** Diagnostic listing, including rejected candidates and the engine's actual reason. */
export function inspectActions(s: GameState, side: Side, catalog: Catalog) {
    return offeredCandidates(s, side).map(command => {
        const result = applyCommand(s, command, catalog);
        return { command, legal: !result.error, error: result.error ?? null };
    });
}

export interface ActionLine {
    commands: Command[];
    state: GameState;
    status: 'resolved' | 'other-player-choice' | 'game-over' | 'limit';
    uncertain: boolean;
}

/** Seeded simulation for engine tools, never a player's observation or an outcome guarantee. */
export function enumerateActionLines(s: GameState, side: Side, catalog: Catalog, options: {
    source?: string; types?: Command['type'][]; maxDepth?: number; maxNodes?: number;
} = {}): { lines: ActionLine[]; nodes: number; truncated: boolean; simulation: 'seeded' } {
    const maxDepth = options.maxDepth ?? 12, maxNodes = options.maxNodes ?? 1000;
    if (!Number.isInteger(maxDepth) || maxDepth < 1 || !Number.isInteger(maxNodes) || maxNodes < 1)
        throw new Error('Action-line limits must be positive integers');
    const touchedUncertainty = (before: GameState, after: GameState) => before.rng !== after.rng
        || before.players.some((player, index) => player.yojo.length !== after.players[index].yojo.length || player.sweet.length !== after.players[index].sweet.length);
    const lines: ActionLine[] = [];
    let nodes = 0, truncated = false;
    const visit = (state: GameState, commands: Command[], uncertain: boolean) => {
        const status = state.winner !== null ? 'game-over' : state.pending?.task.actor !== undefined && state.pending.task.actor !== side
            ? 'other-player-choice' : !state.pending ? 'resolved' : commands.length >= maxDepth || nodes >= maxNodes ? 'limit' : null;
        if (status) {
            if (status === 'limit') truncated = true;
            lines.push({ commands, state, status, uncertain });
            return;
        }
        for (const action of legalActions(state, side, catalog)) {
            if (nodes >= maxNodes) { truncated = true; break; }
            nodes++;
            visit(action.next, [...commands, action.command], uncertain || touchedUncertainty(state, action.next));
        }
    };
    for (const action of legalActions(s, side, catalog)) {
        if (options.source && (!('uid' in action.command) || action.command.uid !== options.source)) continue;
        if (options.types && !options.types.includes(action.command.type)) continue;
        if (nodes >= maxNodes) { truncated = true; break; }
        nodes++;
        visit(action.next, [action.command], touchedUncertainty(s, action.next));
    }
    return { lines, nodes, truncated, simulation: 'seeded' };
}
