// Commands during a turn: play, attack, skills, choices and ending the turn.
import { scriptOf } from '../cards/registry.ts';
import { costOf, isRealSweet, note } from '../core/cards.ts';
import { canAttack, resolveAttack } from '../core/combat.ts';
import { enterField, FIELD_SIZE, openSlot } from '../core/zones.ts';
import { cardContext, effects } from '../effects/context.ts';
import { RuleError } from '../model.ts';
import type { Catalog, Definition, GameState, Player, Side } from '../model.ts';
import { skillsFor } from '../playables/skills.ts';
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

export const turnCommands: Handlers<'play' | 'attack' | 'end' | 'reveal' | 'skill' | 'choose'> = {
    play(s, c, catalog) {
        assertMainPhase(s, c.actor);
        const p = s.players[c.actor];
        if (!p.hand.includes(c.uid)) throw new RuleError('そのカードは手札にありません');
        const card = s.cards[c.uid], def = catalog[card.cardId], cost = costOf(s, c.uid, catalog, c.actor);
        if (cost > p.pp) throw new RuleError('PPが足りません');
        const slot = c.slot ?? openSlot(s, c.actor);
        if (def.type === 'yojo') {
            if (p.field.length >= FIELD_SIZE) throw new RuleError('場は7人までです');
            if (!Number.isInteger(slot) || slot < 0 || slot >= FIELD_SIZE || p.field.some(id => s.cards[id].slot === slot)) throw new RuleError('空いている場を選んでください');
        }
        p.pp -= cost;
        p.hand = p.hand.filter(id => id !== c.uid);
        note(s, `${p.name}：「${def.name}」をプレイ（${cost}PP）`);
        if (def.type === 'yojo') {
            enterField(s, c.actor, c.uid, catalog, true, slot);
        } else {
            p.nap.push(c.uid);
            scriptOf(card.cardId).onPlay?.(cardContext(s, catalog, c.actor, c.uid, sweetMultiplier(p, def, catalog)));
        }
        for (const zone of ['hand', 'field'] as const) {
            for (const uid of [...p[zone]].filter(id => id !== c.uid))
                scriptOf(s.cards[uid].cardId).onOwnerPlayed?.(cardContext(s, catalog, c.actor, uid), c.uid, zone);
        }
        // Recorded after the effect, so 「既に」 conditions do not count this card.
        p.played.push(card.cardId);
    },
    attack(s, c, catalog) {
        if (!canAttack(s, c.actor, c.uid, c.target, catalog)) throw new RuleError('その対象には攻撃できません');
        resolveAttack(s, c.actor, c.uid, c.target, catalog);
    },
    end(s, c) {
        assertMainPhase(s, c.actor);
        s.queue.push({ op: 'trimHand', actor: c.actor }, { op: 'finishTurn', actor: c.actor });
    },
    reveal(s, c) {
        assertMainPhase(s, c.actor);
        if (!s.players[c.actor].hand.includes(c.uid) || !scriptOf(s.cards[c.uid].cardId).revealable) throw new RuleError('公開できるカードではありません');
        s.cards[c.uid].revealed = true;
    },
    skill(s, c, catalog) {
        assertMainPhase(s, c.actor);
        const p = s.players[c.actor], skill = skillsFor(p.playable)[c.index];
        if (!skill || p.skills[c.index] <= 0) throw new RuleError('スキルの残り回数がありません');
        if (skill.cost > p.pp) throw new RuleError('PPが足りません');
        const fx = effects(s, catalog, c.actor);
        const blocked = skill.blocked?.(fx);
        if (blocked) throw new RuleError(blocked);
        p.pp -= skill.cost;
        p.skills[c.index]--;
        note(s, `${p.name}：${skill.name}`);
        skill.use(fx);
    },
    // Answers the pending choice; the waiting step re-runs with the option as its target.
    choose(s, c) {
        if (!s.pending || s.pending.task.actor !== c.actor || !s.pending.options.some(o => o.id === c.option)) throw new RuleError('この選択はできません');
        const task = s.pending.task;
        s.pending = null;
        s.queue.unshift({ ...task, target: c.option });
    },
};
