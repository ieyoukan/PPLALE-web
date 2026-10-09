// Commands during a turn: play, attack, skills, choices and ending the turn.
import { canPlay } from '../view.ts';
import { scriptFor } from '../cards/registry.ts';
import { costOf, isRealSweet, note } from '../core/cards.ts';
import { canAttack, resolveAttack } from '../core/combat.ts';
import { markAction } from '../core/stall.ts';
import { enterField, FIELD_SIZE, openSlot } from '../core/zones.ts';
import { cardContext, effects } from '../effects/context.ts';
import { RuleError } from '../model.ts';
import type { Catalog, Definition, GameState, Player, Side } from '../model.ts';
import { skillsFor } from '../playables/skills.ts';
import { fruitsOf } from '../core/protection.ts';
import { activateExSkill } from '../playables/exSkills.ts';
import type { Handlers } from './types.ts';

function assertMainPhase(s: GameState, actor: Side) {
    if (s.phase !== 'playing') throw new RuleError('ダイス・先攻後攻の選択・初期ドロー・手札の確認を完了してください');
    if (s.active !== actor) throw new RuleError('相手のターンです');
    if (s.pending) throw new RuleError('効果の選択を先に完了してください');
}

/** おいしくなる呪文 (s_25): the next real sweet other than a soda gets ×(1 + casts). */
function sweetMultiplier(p: Player, def: Definition, catalog: Catalog): number {
    if (!isRealSweet(catalog, def.id) || def.sweetType === 'animal_soda' || !p.sweetBoost) return 1;
    const multiplier = 1 + p.sweetBoost;
    p.sweetBoost = 0;
    return multiplier;
}

export const turnCommands: Handlers<'play' | 'attack' | 'end' | 'reveal' | 'skill' | 'choose' | 'exSkill' | 'acorn'> = {
    play(s, c, catalog) {
        assertMainPhase(s, c.actor);
        const p = s.players[c.actor];
        if (!p.hand.includes(c.uid)) throw new RuleError('そのカードは手札にありません');
        const card = s.cards[c.uid], def = catalog[card.cardId], cost = costOf(s, c.uid, catalog, c.actor);
        if (def.type === 'yojo' && (p.strawberryOnlyUntil ?? -1) >= s.turn && !fruitsOf(s, c.uid, catalog).includes('strawberry')) throw new RuleError('イチゴ狩り：このターンはイチゴタイプの幼女だけプレイできます');
        if (cost > p.pp) throw new RuleError('PPが足りません');
        if (!canPlay(s, c.actor, c.uid, catalog)) throw new RuleError('対象にできる幼女がいないので使えません');
        const slot = c.slot ?? openSlot(s, c.actor);
        if (def.type === 'yojo') {
            if (p.field.length >= FIELD_SIZE) throw new RuleError('場は7人までです');
            if (!Number.isInteger(slot) || slot < 0 || slot >= FIELD_SIZE || p.field.some(id => s.cards[id].slot === slot)) throw new RuleError('空いている場を選んでください');
        }
        markAction(s);
        p.pp -= cost;
        p.hand = p.hand.filter(id => id !== c.uid);
        note(s, `${p.name}：「${def.name}」をプレイ（${cost}PP）`);
        if (def.type === 'yojo') {
            enterField(s, c.actor, c.uid, catalog, true, slot);
        } else {
            p.nap.push(c.uid);
            scriptFor(s, c.uid).onPlay?.(cardContext(s, catalog, c.actor, c.uid, sweetMultiplier(p, def, catalog)));
        }
        for (const zone of ['hand', 'field'] as const) {
            for (const uid of [...p[zone]].filter(id => id !== c.uid))
                scriptFor(s, uid).onOwnerPlayed?.(cardContext(s, catalog, c.actor, uid), c.uid, zone);
        }
        // Recorded after the effect, so 「既に」 conditions do not count this card.
        p.played.push(card.cardId);
    },
    attack(s, c, catalog) {
        if (!canAttack(s, c.actor, c.uid, c.target, catalog)) throw new RuleError('その対象には攻撃できません');
        markAction(s);
        resolveAttack(s, c.actor, c.uid, c.target);
    },
    end(s, c) {
        assertMainPhase(s, c.actor);
        s.queue.push({ op: 'trimHand', actor: c.actor }, { op: 'endEffects', actor: c.actor });
    },
    reveal(s, c, catalog) {
        if (s.phase !== 'playing' || s.pending) throw new RuleError('効果の選択を先に完了してください');
        if (!s.players[c.actor].hand.includes(c.uid) || !scriptFor(s, c.uid).revealable) throw new RuleError('公開できるカードではありません');
        if (s.cards[c.uid].revealed) return;
        s.cards[c.uid].revealed = true;
        scriptFor(s, c.uid).onReveal?.(cardContext(s, catalog, c.actor, c.uid));
    },
    skill(s, c, catalog) {
        assertMainPhase(s, c.actor);
        const p = s.players[c.actor], skill = skillsFor(p.playable)[c.index];
        if (!skill || p.skills[c.index] <= 0) throw new RuleError('スキルの残り回数がありません');
        if (skill.cost > p.pp) throw new RuleError('PPが足りません');
        const fx = effects(s, catalog, c.actor);
        const blocked = skill.blocked?.(fx);
        if (blocked) throw new RuleError(blocked);
        markAction(s);
        p.pp -= skill.cost;
        p.skills[c.index]--;
        p.skillHistory = [...(p.skillHistory ?? []), c.index];
        note(s, `${p.name}：${skill.name}`);
        skill.use(fx);
        for (const owner of [c.actor, c.actor === 0 ? 1 : 0] as Side[]) for (const uid of s.players[owner].field)
            scriptFor(s, uid).onSkill?.(cardContext(s, catalog, owner, uid));
    },
    exSkill(s, c, catalog) {
        assertMainPhase(s, c.actor);
        activateExSkill(s, c.actor, c.skill, catalog);
    },
    acorn(s, c) {
        if (s.phase !== 'playing' || s.pending || !(s.players[c.actor].acorns ?? 0)) throw new RuleError('どんぐりを使用できません');
        s.players[c.actor].acorns!--;
        if (c.mode === 'draw') s.queue.push({ op: 'draw', actor: c.actor });
        else s.players[c.actor].pp = Math.min(12, s.players[c.actor].pp + 1);
        markAction(s);
    },
    // Answers the pending choice; the waiting step re-runs with the option as its target.
    choose(s, c) {
        if (!s.pending || s.pending.task.actor !== c.actor || !s.pending.options.some(o => o.id === c.option)) throw new RuleError('この選択はできません');
        const task = s.pending.task;
        s.pending = null;
        s.queue.unshift({ ...task, target: c.option });
    },
};
