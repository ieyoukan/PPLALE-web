// ターン中の操作。カード使用・攻撃・スキル・選択肢への回答・ターン終了を扱う。
import { canPlay } from '../view.ts';
import { scriptFor } from '../cards/registry.ts';
import { costOf, increasePp } from '../core/cards.ts';
import { canAttack, resolveAttack } from '../core/combat.ts';
import { markAction } from '../core/stall.ts';
import { FIELD_SIZE, openSlot, reveal } from '../core/zones.ts';
import { other, RuleError } from '../model.ts';
import type { GameState, Side } from '../model.ts';
import { activateSkill } from '../playables/usage.ts';
import { commitPlay, playAnswers } from './play.ts';
import { fruitsOf } from '../core/protection.ts';
import { activateExSkill } from '../playables/exSkills.ts';
import type { Handlers } from './types.ts';

function assertMainPhase(s: GameState, actor: Side) {
    if (s.phase !== 'playing') throw new RuleError('ダイス・先攻後攻の選択・初期ドロー・手札の確認を完了してください');
    if (s.active !== actor) throw new RuleError('相手のターンです');
    if (s.pending) throw new RuleError('効果の選択を先に完了してください');
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
        // ぶらんちゃん: a unit with a 「手札から場に出たとき」 effect can be answered from the other hand. Until
        // that is decided the card stays in hand and nothing is paid.
        if (def.type === 'yojo' && scriptFor(s, c.uid).onPlay && playAnswers(s, other(c.actor)).length)
            s.queue.push({ op: 'playResponse', actor: other(c.actor), source: c.uid, value: slot });
        else commitPlay(s, c.actor, c.uid, slot, catalog);
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
        reveal(s, c.uid, catalog);
    },
    skill(s, c, catalog) {
        assertMainPhase(s, c.actor);
        activateSkill(s, c.actor, c.index, catalog);
    },
    exSkill(s, c, catalog) {
        assertMainPhase(s, c.actor);
        activateExSkill(s, c.actor, c.skill, catalog);
    },
    acorn(s, c) {
        // 「自分のターン中、任意のタイミングで」 (user ruling).
        if (s.phase !== 'playing' || s.pending || s.active !== c.actor || !(s.players[c.actor].acorns ?? 0)) throw new RuleError('どんぐりは自分のターン中に使えます');
        s.players[c.actor].acorns!--;
        // The draw is the どんぐりカウント's (a system draw, not a card effect: 魅惑の水煙 does not count it).
        if (c.mode === 'draw') s.queue.push({ op: 'draw', actor: c.actor, text: 'acorn' });
        // 「使用できるPPを1増やす」: past the 最大PP, even at 12 (ユーザー裁定).
        else increasePp(s, c.actor, 1);
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
