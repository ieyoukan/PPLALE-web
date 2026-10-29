// 画面に必要な読み取り専用の補助処理。ReactやDOMには依存させない。
import { scriptFor, scriptOf } from './cards/registry.ts';
import { canAttack } from './core/combat.ts';
import { fruitsOf } from './core/protection.ts';
import { cardContext, effects } from './effects/context.ts';
import { activePassive, playableMp, playablePassives, skillAt, skillLimit, skillPrice, skillsFor } from './playables/skills.ts';
import { skillUnavailable } from './playables/usage.ts';
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
    /** Private draft: the cards stay unrevealed until the `done` choice. */
    reveal?: { selected: string[] };
}

export function pendingView(s: GameState): PendingView | null {
    if (!s.pending) return null;
    const { task, prompt, options } = s.pending;
    const view: PendingView = { actor: task.actor, op: task.op, prompt, units: [], hand: [], decks: [], buttons: [] };
    if (task.op === 'cardEffect' && task.step === 'reveal' && options.some(option => option.id === 'done')) {
        view.reveal = { selected: [...(task.ids ?? [])] };
    }
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
    !(catalog[s.cards[uid].cardId].type === 'yojo' && (s.players[side].strawberryOnlyUntil ?? -1) >= s.turn && !fruitsOf(s, uid, catalog).includes('strawberry'))
    && (scriptFor(s, uid).canPlay?.(cardContext(s, catalog, side, uid)) ?? true);

/** Why the skill cannot be used now apart from PP and remaining uses (e.g. nothing to select), or undefined. */
export const skillBlocked = (s: GameState, side: Side, index: number, catalog: Catalog) =>
    skillAt(s.players[side], index)?.skill.blocked?.(effects(s, catalog, side));

/** One skill of a playable as a skill panel shows it. */
export interface SkillView {
    name: string;
    /** What it costs now (a passive can change the printed PP cost). */
    pp: number;
    mp: number;
    /** Uses left and the most it can have; null for a skill without a use limit. */
    left: number | null;
    limit: number | null;
    /** Used in answer to the opponent (the engine asks when it can be), not with the `skill` command. */
    reaction: boolean;
    /** Why the `skill` command would be rejected now (whose turn it is aside), or undefined. */
    unavailable?: string;
}
/** A skill taken from the opponent (レンテ): `index` is the one the `skill` command uses. */
export interface TakenSkillView extends SkillView {
    index: number;
    /** The playable it is printed on and its index there, for its text. */
    playable: string;
    origin: number;
}
/** A playable's skills, 固有パッシブスキル and MP for one side, with the current costs and limits. */
export interface PlayableView {
    skills: SkillView[];
    /** Skills taken from the opponent (レンテ), used like the own ones. */
    taken: TakenSkillView[];
    /** `active`: its condition holds now (always, for one without a condition). */
    passive?: { name: string; active: boolean };
    mp?: { current: number; max: number };
}
export function playableView(s: GameState, side: Side, catalog: Catalog): PlayableView {
    const p = s.players[side], passive = playablePassives[p.playable], mp = playableMp[p.playable];
    return {
        skills: skillsFor(p.playable).map((skill, index) => ({
            name: skill.name, ...skillPrice(p, index, catalog), reaction: !!skill.reaction,
            left: skill.uses === undefined ? null : p.skills[index] ?? 0,
            limit: skill.uses === undefined ? null : skillLimit(p, index, catalog),
            unavailable: skillUnavailable(s, side, index, catalog),
        })),
        taken: (p.extraSkills ?? []).flatMap((entry, extra): TakenSkillView[] => {
            const index = skillsFor(p.playable).length + extra, skill = skillAt(p, index)?.skill;
            return skill ? [{
                name: skill.name, pp: skill.cost, mp: skill.mp ?? 0, reaction: false, left: entry.uses, limit: null,
                unavailable: skillUnavailable(s, side, index, catalog), index, playable: entry.playable, origin: entry.index,
            }] : [];
        }),
        ...(passive ? { passive: { name: passive.name, active: !!activePassive(p, catalog) } } : {}),
        ...(mp ? { mp: { current: p.mp ?? 0, max: mp.max } } : {}),
    };
}

/** The card can be revealed from hand with the `reveal` command. */
export const isRevealable = (cardId: string) => !!scriptOf(cardId).revealable;
