import { scriptFor } from '../cards/registry.ts';
import type { OpTable } from '../cards/types.ts';
import { attackOf, costOf, hit, hpOf, note } from '../core/cards.ts';
import { colorProtected } from '../core/protection.ts';
import { rollDie } from '../core/rng.ts';
import { losePoints } from '../core/points.ts';
import { exile } from '../core/zones.ts';
import { cardContext } from './context.ts';
import { beginTurn } from '../commands/phases.ts';
import { commitPlay, playAnswers } from '../commands/play.ts';
import type { Task } from '../model.ts';
import { skillsFor } from '../playables/skills.ts';
import { activateSkill, reactionSkills } from '../playables/usage.ts';
import { diceChoice } from './diceChoice.ts';

export const expandedOps: OpTable = {
    endEffects: {
        run(fx) {
            for (const uid of [...fx.me.field]) {
                scriptFor(fx.s, uid).onTurnEnd?.(cardContext(fx.s, fx.catalog, fx.side, uid));
                // リマチャン: 「自分のターン終了時、この幼女をこのゲームから除外する」 given to the unit.
                if (fx.me.field.includes(uid) && fx.s.cards[uid].keywords.includes('exileAtEnd')) exile(fx.s, uid, fx.catalog, fx.side);
            }
            fx.queue('finishTurn');
        },
    },
    beginTurn: { run: (fx, t) => beginTurn(fx.s, t.actor, fx.catalog) },
    /** Queued after the on-play effects of a unit played at 0 HP: once it has run, `settle` destroys the unit. */
    playedAtZero: { run: () => {} },
    turnDraw: {
        run(fx, t) {
            if ((fx.me.skipDraw ?? 0) > 0) { fx.me.skipDraw!--; fx.note('ドローフェイズをスキップ'); return; }
            fx.next({ ...t, op: 'turnDrawResponse', actor: fx.foeSide });
        },
    },
    turnDrawResponse: {
        run(fx, t) {
            if (t.target && t.target !== 'skip') {
                fx.me.pp -= 4;
                fx.exile(t.target);
                fx.queue('draw');
                fx.note('リンネが相手のドローフェイズをスキップ');
                return;
            }
            const eligible = fx.me.pp >= 4 ? fx.me.hand.filter(uid => fx.s.cards[uid].cardId === 'y_122' && !fx.s.cards[uid].silenced) : [];
            if (!t.target && eligible.length) { fx.ask('リンネを除外して4PP払い、相手のドローフェイズをスキップしますか？', [{ id: 'skip', label: '発動しない' }, ...eligible.map(id => ({ id, label: 'リンネを除外して発動' }))], t); return; }
            fx.queue('draw', { actor: fx.foeSide, text: 'turn', source: undefined });
        },
    },
    cardEffect: {
        run(fx, t) { if (t.source) scriptFor(fx.s, t.source).effect?.(cardContext(fx.s, fx.catalog, t.actor, t.source, t.multiplier, t.blockedTarget), t); },
        cpu: (fx, t, options) => t.source ? scriptFor(fx.s, t.source).cpu?.choose?.(cardContext(fx.s, fx.catalog, t.actor, t.source), t, options) : undefined,
    },
    die: {
        run(fx, t) {
            const credit = fx.me.exSkills?.dice;
            const automatic = !!credit && credit.uses > 0;
            if (automatic && (!t.target || !/^[1-6]$/.test(t.target))) {
                const choice = diceChoice(credit.uses);
                fx.ask(choice.prompt, choice.options, t);
                return;
            }
            const value = automatic ? Number(t.target) : rollDie(fx.s);
            if (automatic) credit.uses--;
            fx.s.effectRoll = { revision: fx.s.revision + 1, side: t.actor, value, cardId: t.source ? fx.s.cards[t.source].cardId : undefined };
            if (t.resume) fx.next({ ...t.resume, value });
        },
    },
    avoidEffect: {
        run(fx, t) {
            const avoided = (t.value ?? 0) >= (fx.s.cards[t.target!].evasion ?? 5);
            if (avoided) fx.note(`${fx.defOf(t.target!).name}がおにごっこで回避`);
            fx.next({ ...t.resume!, checked: true, ...(avoided ? { blockedTarget: t.target } : {}) });
        },
    },
    exile: { target: 'unit', run: (fx, t) => fx.exile(t.target!) },
    bounce: { target: 'unit', run: (fx, t) => fx.bounce(t.target!) },
    /**
     * The owner of a reaction skill is asked whether to use it in answer to `step` (what happened:
     * `source` did it to `subject`), then `resume` continues, changed by what the used skill returns.
     * A playable's skills and their remaining uses are public, so the question is not hidden (redact.ts).
     */
    skillReaction: {
        run(fx, t) {
            const skills = skillsFor(fx.me.playable);
            if (t.target && t.target !== 'skip') {
                const change = activateSkill(fx.s, t.actor, Number(t.target), fx.catalog, t);
                fx.next({ ...t.resume!, ...change });
                return;
            }
            const usable = t.target ? [] : reactionSkills(fx.s, t.actor, t, fx.catalog);
            if (usable.length) {
                fx.ask('スキルを使いますか？', [{ id: 'skip', label: '使わない' }, ...usable.map(index => ({ id: String(index), label: `${skills[index].name}を使う` }))], t);
                return;
            }
            fx.next(t.resume!);
        },
        cpu: (fx, t, options) => options.find(id => id !== 'skip' && skillsFor(fx.me.playable)[Number(id)]?.cpu?.(fx, t)) ?? 'skip',
    },
    attackStart: {
        run(fx, t) {
            // Before anything else the defender may answer the attack with a reaction skill (ちょり), once.
            if (t.target !== 'leader' && t.value === undefined && t.step !== 'answered') {
                const event: Task = { op: 'skillReaction', actor: fx.foeSide, source: t.source, subject: t.target, step: 'attacked', resume: { ...t, step: 'answered' } };
                if (reactionSkills(fx.s, fx.foeSide, event, fx.catalog).length) {
                    fx.next(event);
                    return;
                }
            }
            if (t.target !== 'leader' && fx.s.cards[t.target!].keywords.includes('evade')) {
                if (t.value === undefined) {
                    fx.next({ op: 'die', actor: fx.foeSide, source: t.target, resume: t });
                    return;
                }
                if (t.value >= (fx.s.cards[t.target!].evasion ?? 5)) {
                    fx.note(`${fx.defOf(t.target!).name}がおにごっこで攻撃を回避`);
                    scriptFor(fx.s, t.target!).onEvade?.(cardContext(fx.s, fx.catalog, fx.foeSide, t.target!), t.source!);
                    return;
                }
            }
            fx.next({ ...t, op: 'attackHooks' });
        },
    },
    attackHooks: {
        run(fx, t) {
            scriptFor(fx.s, t.source!).onAttack?.(cardContext(fx.s, fx.catalog, t.actor, t.source!), t.target!);
            // The attacking (active) side's 攻撃時 steps resolve first, then the defender's 被攻撃時.
            fx.queue('defendHooks', { source: t.source, subject: t.target });
            fx.queue('attackResponses', { actor: fx.foeSide, source: t.source, subject: t.target, ids: [] });
        },
    },
    defendHooks: {
        run(fx, t) {
            const target = t.subject!;
            // What the hook does to the attacker is stopped by the attacker's 色おに inside `ctx`, as for any
            // effect; what the defender does to itself (まめろん 0/+2) is not.
            if (target === 'leader' || !fx.me.field.includes(t.source!) || !fx.foe.field.includes(target)) return;
            scriptFor(fx.s, target).onDefend?.(cardContext(fx.s, fx.catalog, fx.foeSide, target), t.source!);
        },
    },
    attackResponses: {
        run(fx, t) {
            if (!fx.foe.field.includes(t.source!)) return;
            if (t.target && t.target !== 'skip') {
                const card = fx.s.cards[t.target];
                fx.reveal(t.target);
                if (card.cardId === 'y_91') {
                    // あみの: discarded, and 2 PP cancel the attack. The attacker has acted, whatever actions it had left.
                    fx.discard(t.target);
                    fx.me.pp -= 2;
                    fx.s.cards[t.source!].exhausted = true;
                    fx.note('あみのが攻撃を無効化');
                    return;
                }
                card.costDelta++;
                cardContext(fx.s, fx.catalog, t.actor, t.target).buff(t.source!, -1, 0);
                t = { ...t, ids: [...(t.ids ?? []), t.target], target: undefined };
            }
            const held = (cardId: string) => fx.me.hand.filter(uid => fx.s.cards[uid].cardId === cardId && !fx.s.cards[uid].silenced && !(t.ids ?? []).includes(uid));
            const linne = held('y_33');
            // あみの answers an attack on one of its owner's units, and only with 2 PP left to pay.
            const amino = t.subject !== 'leader' && fx.me.field.includes(t.subject!) && fx.me.pp >= 2 ? held('y_91') : [];
            if (t.target !== 'skip' && (linne.length || amino.length)) {
                const prompt = !amino.length ? 'リンネを公開して攻撃した幼女を-1/0しますか？' : !linne.length ? 'あみのを公開して捨て、2PPで攻撃を無効にしますか？' : '手札の幼女で攻撃に対応しますか？';
                fx.ask(prompt, [{ id: 'skip', label: '発動しない' }, ...linne.map(id => ({ id, label: fx.defOf(id).name })), ...amino.map(id => ({ id, label: `${fx.defOf(id).name}：2PPで攻撃を無効化` }))], t);
                return;
            }
            fx.next({ op: 'combat', actor: fx.foeSide, source: t.source, target: t.subject });
            fx.queue('attackEnd', { actor: fx.foeSide, source: t.source, subject: t.subject });
        },
    },
    combat: {
        run(fx, t) {
            if (!fx.me.field.includes(t.source!)) return;
            if (t.target === 'leader') {
                fx.queue('eatResponse', { actor: fx.foeSide, amount: attackOf(fx.s.cards[t.source!], fx.catalog) });
                return;
            }
            if (!fx.foe.field.includes(t.target!)) return;
            const attacker = fx.s.cards[t.source!], defender = fx.s.cards[t.target!];
            const a = attackOf(attacker, fx.catalog), b = attackOf(defender, fx.catalog);
            const before = { [t.source!]: attacker.damage, [t.target!]: defender.damage }, defenderHp = hpOf(defender, fx.catalog);
            if (!colorProtected(fx.s, t.target!, t.actor, t.source, fx.catalog)) hit(fx.s, t.target!, a, false);
            // 「攻撃時この幼女はダメージを受けない」 (とここ): nothing comes back.
            if (!scriptFor(fx.s, t.source!).unharmedAttacking && !colorProtected(fx.s, t.source!, fx.foeSide, t.target, fx.catalog)) hit(fx.s, t.source!, b, false);
            // 「相手幼女からの攻撃で破壊されたとき」: only the unit that was attacked. An attacker that dies
            // to the damage it takes back was not destroyed by an attack.
            const killed = hpOf(defender, fx.catalog) <= 0;
            if (killed) defender.destroyedBy = t.source;
            note(fx.s, `${fx.defOf(t.source!).name}が${fx.defOf(t.target!).name}を攻撃`);
            // 「ダメージを受けて破壊されなかったならば」 (しゅお): the attacking side first.
            for (const [uid, side] of [[t.source!, t.actor], [t.target!, fx.foeSide]] as const) {
                const card = fx.s.cards[uid];
                if (card.damage > before[uid] && hpOf(card, fx.catalog) > 0) scriptFor(fx.s, uid).onCombatDamage?.(cardContext(fx.s, fx.catalog, side, uid), card.damage - before[uid]);
            }
            if (killed) scriptFor(fx.s, t.source!).onAttackKill?.(cardContext(fx.s, fx.catalog, t.actor, t.source!), t.target!, Math.max(0, a - defenderHp));
        },
    },
    /** 攻撃終了時: after the combat and what it destroyed, for an attacker still on the field. */
    attackEnd: {
        run(fx, t) {
            if (fx.me.field.includes(t.source!)) scriptFor(fx.s, t.source!).onAttackEnd?.(cardContext(fx.s, fx.catalog, t.actor, t.source!), t.subject!);
        },
    },
    /** 「自分のお菓子ポイントが回復するたびに」: queued by `heal` when a card of that side reacts to it. */
    healHooks: {
        run(fx, t) {
            for (const zone of ['field', 'nap'] as const) {
                for (const uid of [...fx.me[zone]]) scriptFor(fx.s, uid).onHealed?.(cardContext(fx.s, fx.catalog, t.actor, uid), zone);
            }
        },
    },
    /**
     * ぶらんちゃん: the other player (`foe` here) is playing unit `source`, which has a 「手札から場に出たとき」
     * effect. Declined, the play goes on. Used, ぶらんちゃん and two more hand cards leave the game and the
     * unit rests in its owner's nap: nothing was paid and nothing triggers.
     */
    playResponse: {
        run(fx, t) {
            const played = t.source!;
            if (!t.subject) {
                const answers = t.target ? [] : playAnswers(fx.s, fx.side);
                if (answers.length) {
                    fx.ask(`相手が「${fx.defOf(played).name}」をプレイしました。ぶらんちゃんと手札2枚を除外して、効果を不発にしてお昼寝場所へ送りますか？`,
                        [{ id: 'skip', label: '発動しない' }, ...answers.map(id => ({ id, label: 'ぶらんちゃんを除外して発動' }))], t);
                    return;
                }
                if (!t.target || t.target === 'skip') { commitPlay(fx.s, fx.foeSide, played, t.value!, fx.catalog); return; }
                t = { ...t, subject: t.target, target: undefined, ids: [] };
            } else if (t.target) t = { ...t, ids: [...(t.ids ?? []), t.target], target: undefined };
            const rest = fx.me.hand.filter(uid => uid !== t.subject && !(t.ids ?? []).includes(uid)), needed = 2 - (t.ids ?? []).length;
            if (needed > 0 && rest.length > needed) { fx.pick(`一緒に除外する手札を選んでください（あと${needed}枚）`, rest, t); return; }
            for (const uid of [t.subject!, ...(t.ids ?? []), ...(needed > 0 ? rest : [])]) exile(fx.s, uid, fx.catalog, fx.side);
            fx.foe.hand = fx.foe.hand.filter(uid => uid !== played);
            fx.foe.nap.push(played);
            Object.assign(fx.s.cards[played], { costDelta: 0, temporaryCost: 0 });
            fx.note(`ぶらんちゃんが「${fx.defOf(played).name}」の効果を不発にしてお昼寝場所へ送りました`);
        },
        // Worth three cards only against an expensive unit; then the cheapest cards go with it.
        cpu(fx, t, options) {
            if (!t.subject) return fx.defOf(t.source!).cost >= 5 ? options.find(id => id !== 'skip') : 'skip';
            return [...options].sort((a, b) => costOf(fx.s, a, fx.catalog, fx.side) - costOf(fx.s, b, fx.catalog, fx.side))[0];
        },
    },
    eatResponse: {
        run(fx, t) {
            // Attack 0 still counts as having eaten (お仕置き・りくす); there is just no change for うぃまる to stop.
            fx.s.cards[t.source!].ateOn = fx.s.turn;
            if ((t.amount ?? 0) <= 0) return;
            if (t.target && t.target !== 'skip') {
                fx.reveal(t.target);
                fx.discard(t.target);
                // The deck choice belongs to the defending player. Empty decks do not prevent activation.
                fx.next({ op: 'cardEffect', actor: t.actor, source: t.target, step: 'barrier', count: Math.floor(t.amount! * 1.5) });
                fx.note('うぃまるがお菓子ポイントの変動を無効化');
                return;
            }
            const eligible = fx.me.hand.filter(uid => fx.s.cards[uid].cardId === 'y_64' && !fx.s.cards[uid].silenced);
            if (!t.target && eligible.length) {
                fx.ask('うぃまるを公開して捨て、お菓子ポイントの変動を無効にしますか？', [{ id: 'skip', label: '発動しない' }, ...eligible.map(id => ({ id, label: fx.defOf(id).name }))], t);
                return;
            }
            losePoints(fx.s, t.actor, t.amount!, 'eat');
        },
    },
};
