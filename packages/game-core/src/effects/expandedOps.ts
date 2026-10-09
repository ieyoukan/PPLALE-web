import { scriptFor } from '../cards/registry.ts';
import type { OpTable } from '../cards/types.ts';
import { attackOf, hit, hpOf, note } from '../core/cards.ts';
import { colorProtected } from '../core/protection.ts';
import { rollDie } from '../core/rng.ts';
import { losePoints } from '../core/points.ts';
import { cardContext } from './context.ts';
import { beginTurn } from '../commands/phases.ts';

export const expandedOps: OpTable = {
    endEffects: {
        run(fx) {
            for (const uid of [...fx.me.field]) scriptFor(fx.s, uid).onTurnEnd?.(cardContext(fx.s, fx.catalog, fx.side, uid));
            fx.queue('finishTurn');
        },
    },
    beginTurn: { run: (fx, t) => beginTurn(fx.s, t.actor, fx.catalog) },
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
    cardEffect: { run(fx, t) { if (t.source) scriptFor(fx.s, t.source).effect?.(cardContext(fx.s, fx.catalog, t.actor, t.source, t.multiplier, t.blockedTarget), t); } },
    die: {
        run(fx, t) {
            const credit = fx.me.exSkills?.dice;
            if (!t.target && credit && credit.uses > 0) {
                fx.ask('クマはサイコロを振らない：出目を指定しますか？', [{ id: 'roll', label: '使わずに振る' }, ...Array.from({ length: 6 }, (_, i) => ({ id: String(i + 1), label: `出目を${i + 1}にする（残り${credit.uses}回）` }))], t);
                return;
            }
            const value = t.target && t.target !== 'roll' ? Number(t.target) : rollDie(fx.s);
            if (t.target && t.target !== 'roll' && credit) credit.uses--;
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
    attackStart: {
        run(fx, t) {
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
            if (target === 'leader' || !fx.me.field.includes(t.source!) || !fx.foe.field.includes(target) || colorProtected(fx.s, t.source!, fx.foeSide, target, fx.catalog)) return;
            scriptFor(fx.s, target).onDefend?.(cardContext(fx.s, fx.catalog, fx.foeSide, target), t.source!);
        },
    },
    attackResponses: {
        run(fx, t) {
            if (!fx.foe.field.includes(t.source!)) return;
            if (t.target && t.target !== 'skip') {
                const card = fx.s.cards[t.target];
                fx.reveal(t.target);
                card.costDelta++;
                cardContext(fx.s, fx.catalog, t.actor, t.target).buff(t.source!, -1, 0);
                t = { ...t, ids: [...(t.ids ?? []), t.target], target: undefined };
            }
            const eligible = fx.me.hand.filter(uid => fx.s.cards[uid].cardId === 'y_33' && !fx.s.cards[uid].silenced && !(t.ids ?? []).includes(uid));
            if (t.target !== 'skip' && eligible.length) {
                fx.ask('リンネを公開して攻撃した幼女を-1/0しますか？', [{ id: 'skip', label: '発動しない' }, ...eligible.map(id => ({ id, label: fx.defOf(id).name }))], t);
                return;
            }
            fx.next({ op: 'combat', actor: fx.foeSide, source: t.source, target: t.subject });
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
            if (!colorProtected(fx.s, t.target!, t.actor, t.source, fx.catalog)) hit(fx.s, t.target!, a, false);
            if (!colorProtected(fx.s, t.source!, fx.foeSide, t.target, fx.catalog)) hit(fx.s, t.source!, b, false);
            // 「相手幼女からの攻撃で破壊されたとき」: only the unit that was attacked. An attacker that dies
            // to the damage it takes back was not destroyed by an attack.
            if (hpOf(defender, fx.catalog) <= 0) defender.destroyedBy = t.source;
            note(fx.s, `${fx.defOf(t.source!).name}が${fx.defOf(t.target!).name}を攻撃`);
        },
    },
    eatResponse: {
        run(fx, t) {
            if ((t.amount ?? 0) <= 0) return;
            fx.s.cards[t.source!].ateOn = fx.s.turn;
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
