// プレイアブルのスキル使用可否と支払い。自分のターンの操作と相手ターンの誘発で共用する。
import { scriptFor } from '../cards/registry.ts';
import { note } from '../core/cards.ts';
import { markAction } from '../core/stall.ts';
import { cardContext, effects } from '../effects/context.ts';
import { other, RuleError } from '../model.ts';
import type { Catalog, GameState, Side, Task } from '../model.ts';
import { mpMax, skillAt, skillPrice, skillsFor } from './skills.ts';

/**
 * Why `side` cannot use skill `index` now, or undefined: uses left, when it may be used, PP, MP and
 * the skill's own condition. `event` is the step a reaction skill would answer; without it the
 * skill is used with the `skill` command (whose turn it is is checked by the command).
 */
export function skillUnavailable(s: GameState, side: Side, index: number, catalog: Catalog, event?: Task): string | undefined {
    const p = s.players[side], taken = skillAt(p, index);
    // A skill taken from the opponent (レンテ): its own count of uses and its printed cost.
    if (taken?.extra !== undefined) {
        if (!(p.extraSkills![taken.extra].uses > 0)) return 'スキルの残り回数がありません';
        if (event || taken.skill.reaction) return 'このスキルは自分のターンに使います';
        if (taken.skill.cost > p.pp) return 'PPが足りません';
        if ((taken.skill.mp ?? 0) > (p.mp ?? 0)) return 'MPが足りません';
        return taken.skill.blocked?.(effects(s, catalog, side));
    }
    const skill = skillsFor(p.playable)[index];
    if (!skill || skill.uses !== undefined && !(p.skills[index] > 0)) return 'スキルの残り回数がありません';
    if (skill.reaction !== event?.step) return skill.reaction ? skill.blocked?.(effects(s, catalog, side)) ?? '相手の行動に対して使うスキルです' : 'このスキルは自分のターンに使います';
    const price = skillPrice(p, index, catalog);
    if (price.pp > p.pp) return 'PPが足りません';
    if (price.mp > (p.mp ?? 0)) return 'MPが足りません';
    return skill.blocked?.(effects(s, catalog, side), event);
}

/** The reaction skills `side` can use in answer to `event` (`event.step` names what happened). */
export function reactionSkills(s: GameState, side: Side, event: Task, catalog: Catalog): number[] {
    return skillsFor(s.players[side].playable).flatMap((skill, index) => skill.reaction && !skillUnavailable(s, side, index, catalog, event) ? [index] : []);
}

/**
 * Pays for skill `index` and runs it: cost, one use, the history, the skill itself, then the units
 * that react to a skill (とここ). Throws a RuleError when it cannot be used. Returns what a reaction
 * changes in the step it answers.
 */
export function activateSkill(s: GameState, side: Side, index: number, catalog: Catalog, event?: Task): Partial<Task> | void {
    const reason = skillUnavailable(s, side, index, catalog, event);
    if (reason) throw new RuleError(reason);
    const p = s.players[side], taken = skillAt(p, index)!, skill = taken.skill;
    const price = taken.extra === undefined ? skillPrice(p, index, catalog) : { pp: skill.cost, mp: skill.mp ?? 0 };
    // For the stall rule only a skill with a use limit (or one taken from the opponent) is an action:
    // one without a limit (しゅれい) can be repeated for ever without changing the match (ユーザー裁定).
    if (skill.uses !== undefined || taken.extra !== undefined) markAction(s);
    p.pp -= price.pp;
    if (price.mp) p.mp = (p.mp ?? 0) - price.mp;
    // A taken skill is not one of the playable's own: it has its own count and is not in the history.
    if (taken.extra !== undefined) p.extraSkills![taken.extra].uses--;
    else {
        if (skill.uses !== undefined) p.skills[index]--;
        p.skillHistory = [...(p.skillHistory ?? []), index];
    }
    note(s, `${p.name}：${skill.name}`);
    const change = skill.use(effects(s, catalog, side), event);
    for (const owner of [side, other(side)]) for (const uid of s.players[owner].field)
        scriptFor(s, uid).onSkill?.(cardContext(s, catalog, owner, uid), side);
    return change;
}

/** MP is restored up to the playable's maximum; a playable without MP gains none. */
export function gainMp(s: GameState, side: Side, amount: number) {
    const p = s.players[side], max = mpMax(p.playable);
    if (max) p.mp = Math.max(0, Math.min(max, (p.mp ?? 0) + amount));
}
