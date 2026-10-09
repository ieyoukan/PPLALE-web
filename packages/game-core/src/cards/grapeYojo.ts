import type { CardScripts } from './types.ts';
import { attackOf, costOf, hpOf } from '../core/cards.ts';
import { selectable } from '../effects/targets.ts';
import { skillsFor } from '../playables/skills.ts';
import { exileDecks, gainEx, napCost, napUnits, randomSearch, revealedUnits, revealStep, revive, step, take } from './helpers.ts';

export const grapeYojo: CardScripts = {
    y_31: {
        onPlay: ctx => step(ctx, 'reveal'),
        effect(ctx, t) { revealStep(ctx, t, () => true, () => {
            if (revealedUnits(ctx, 'grape').length >= 2) ctx.buff(ctx.uid, 1, 1);
            if (revealedUnits(ctx, 'strawberry').length >= 2) ctx.queue('draw');
        }); },
    },
    y_32: {
        onPlay(ctx) { if (ctx.me.field.some(uid => uid !== ctx.uid)) step(ctx, 'bounce'); },
        effect(ctx, t) {
            if (!t.target) return ctx.pick('手札に戻す味方幼女を選んでください', ctx.me.field.filter(uid => uid !== ctx.uid), t);
            ctx.bounce(t.target);
            ctx.queue('randomDamage', { amount: 3 });
            ctx.queue('damage', { target: ctx.uid, amount: 3 });
        },
    },
    y_33: { onTurnStart(ctx, active, zone) { if (active === ctx.side && zone === 'hand' && costOf(ctx.s, ctx.uid, ctx.catalog, ctx.side) >= 4) ctx.queue('reduce', { scope: 'friendly', amount: 4 }); } },
    y_34: { onSkill: ctx => ctx.addKeyword(ctx.uid, 'hide') },
    y_35: {
        keywords: ['charge'], onAttack: ctx => step(ctx, 'pay'),
        effect(ctx, t) {
            if (!t.target) return ctx.ask('お菓子ポイントを2減らして+2/+1しますか？', [{ id: 'no', label: '減らさない' }, { id: 'yes', label: '2減らして+2/+1' }], t);
            if (t.target === 'yes') { ctx.losePoints(ctx.side, 2, 'reduce'); ctx.buff(ctx.uid, 2, 1); }
        },
    },
    y_36: {
        onPlay(ctx) { const n = napUnits(ctx).length >= 10 ? 3 : 1; ctx.queue('buff', { scope: 'friendly', ids: [ctx.uid], amount: n, hp: n }); },
        onDestroyed: ctx => { ctx.me.nap.push(ctx.spawn('token_cat')); },
    },
    y_37: { onPlay(ctx) { const n = napUnits(ctx).length; if (n >= 5) { ctx.buff(ctx.uid, 1, 1); ctx.queue('draw'); } if (n >= 10) ctx.addKeyword(ctx.uid, 'fast'); } },
    y_38: {
        onPlay: ctx => step(ctx, 'top'),
        effect(ctx, t) {
            const top = ctx.me.yojo[0];
            if (!top) return;
            if (!t.target) return ctx.ask(`山札の一番上：${ctx.defOf(top).name}`, [{ id: 'keep', label: '一番上に戻す' }, { id: 'nap', label: 'お昼寝場所に捨てる' }], t);
            if (t.target === 'nap') { ctx.me.yojo.shift(); ctx.me.nap.push(top); }
            ctx.queue('draw', { deck: 'yojo' });
        },
    },
    y_39: {
        onPlay: ctx => step(ctx, 'reveal'),
        effect(ctx, t) { revealStep(ctx, t, uid => ctx.defOf(uid).type === 'yojo' && ctx.fruits(uid).includes('grape'), () => {
            const n = revealedUnits(ctx, 'grape').length;
            ctx.queue('randomDamage', { amount: n });
            if (n >= 3) ctx.queue('draw');
        }); },
    },
    y_40: { onPlay(ctx) { for (const uid of ctx.s.players.flatMap(p => p.field)) if (!ctx.protected(uid)) Object.assign(ctx.s.cards[uid], { silenced: true, keywords: [], hiding: false, shield: false, links: [] }); } },
    y_41: {
        onPlay: ctx => step(ctx, 'copyNap', { count: 2, candidates: napUnits(ctx) }),
        effect(ctx, t) {
            if (t.target) { ctx.me.nap.push(ctx.spawn(ctx.s.cards[t.target].cardId)); t = { ...t, target: undefined, count: t.count! - 1, ids: [...(t.ids ?? []), t.target] }; }
            if ((t.count ?? 0) > 0) ctx.pick('複製するお昼寝場所の幼女を選んでください', (t.candidates ?? []).filter(uid => !(t.ids ?? []).includes(uid)), t);
        },
    },
    y_42: {
        onPlay: ctx => step(ctx, 'pay'),
        effect(ctx, t) {
            if (t.step === 'pay') {
                if (!t.target && ctx.me.pp >= 3) return ctx.ask('追加3PPでコスト7以下を場に出しますか？', [{ id: 'no', label: 'コスト3以下' }, { id: 'yes', label: '3PP払ってコスト7以下' }], t);
                if (t.target === 'yes') ctx.me.pp -= 3;
                step(ctx, 'revive', { amount: t.target === 'yes' ? 7 : 3 });
            } else if (!t.target) ctx.pick('場に出す幼女を選んでください', napUnits(ctx).filter(uid => napCost(ctx, uid) <= t.amount!), t);
            else revive(ctx, t.target);
        },
    },
    y_43: {
        onPlay: ctx => step(ctx, 'pay'),
        effect(ctx, t) {
            if (t.step === 'pay') {
                if (!t.target) return ctx.ask('追加で支払うPPを選んでください', Array.from({ length: ctx.me.pp + 1 }, (_, i) => ({ id: String(i), label: `${i}PP：1d6≧${5 - i}` })), t);
                const n = Number(t.target); ctx.me.pp -= n;
                step(ctx, 'grant', { amount: 5 - n });
            } else {
                if (!t.target) return ctx.pick('おにごっこを付与する幼女', ctx.me.field.filter(uid => uid !== ctx.uid), t);
                if (!ctx.s.cards[t.target].keywords.includes('evade')) { ctx.addKeyword(t.target, 'evade'); ctx.s.cards[t.target].evasion = t.amount; }
            }
        },
    },
    y_44: { keywords: ['guard'], onPlay: ctx => randomSearch(ctx, 'strawberry') },
    y_45: { keywords: ['charge'], onPlay: ctx => randomSearch(ctx, 'grape', 'y_45') },
    y_46: {
        onPlay: ctx => step(ctx, 'recover'),
        effect(ctx, t) { if (!t.target) ctx.pick('手札に戻す幼女（コスト2以上）', napUnits(ctx).filter(uid => napCost(ctx, uid) >= 2), t); else take(ctx, t.target, 'nap', true); },
    },
    y_47: {
        onTurnEnd(ctx) { ctx.queue('draw'); ctx.queue('buff', { target: ctx.uid, amount: 0, hp: -2 }); },
    },
    y_48: {
        onEnter: ctx => step(ctx, 'selfDamage'),
        onDestroyed: ctx => step(ctx, 'death'),
        effect(ctx, t) {
            if (t.step === 'selfDamage') {
                if (!t.target) return ctx.ask('ゼロオレンジ自身に3ダメージを与えますか？', [{ id: 'no', label: '与えない' }, { id: 'yes', label: '3ダメージ' }], t);
                if (t.target === 'yes') ctx.damage(ctx.uid, 3);
            } else if (t.step === 'death') {
                if (!t.target) {
                    const eligible = ctx.me.hand.filter(uid => ctx.defOf(uid).name === 'レンス');
                    if (eligible.length) return ctx.ask('レンスを公開して6ダメージにしますか？', [{ id: 'roll', label: '1d6を振る' }, ...eligible.map(id => ({ id, label: 'レンスを公開して6ダメージ' }))], t);
                }
                if (t.target && t.target !== 'roll') { ctx.s.cards[t.target].revealed = true; ctx.queue('randomDamage', { amount: 6 }); }
                else ctx.die({ ...t, step: 'rolled', target: undefined });
            } else ctx.queue('randomDamage', { amount: t.value });
        },
    },
    y_49: {
        keywords: ['evade'], evasion: 5,
        onAttack(ctx) { const a = attackOf(ctx.card, ctx.catalog), h = hpOf(ctx.card, ctx.catalog); ctx.buff(ctx.uid, h - a, a - h); },
    },
    y_50: {},
    y_51: { keywords: ['guard'], onPlay(ctx) { const n = napUnits(ctx).length; if (n >= 5) ctx.queue('draw', { count: n >= 10 ? 2 : 1 }); if (n >= 10) ctx.queue('steal', { amount: 3 }); } },
    y_52: { onPlay: ctx => gainEx(ctx, 'dice', 1) },
    y_53: {
        onPlay: ctx => step(ctx, 'mode'),
        effect(ctx, t) {
            if (t.step === 'mode') {
                if (!t.target) return ctx.ask('しゅれいの効果を選んでください', [{ id: 'grape', label: 'ぶどうタイプ1人を破壊' }, { id: 'random', label: 'ランダムな1人を破壊' }], t);
                if (t.target === 'random') { if (ctx.foe.field.length) ctx.destroy(ctx.foe.field[ctx.random(ctx.foe.field.length)]); }
                else step(ctx, 'destroy', { candidates: selectable(ctx.s, ctx.side, ctx.foe.field.filter(uid => ctx.fruits(uid).includes('grape'))), selected: true });
            } else if (!t.target) ctx.pick('破壊するぶどうタイプの幼女', t.candidates ?? [], t);
            else ctx.destroy(t.target);
        },
    },
    y_54: { keywords: ['charge'], onPlay(ctx) { ctx.queue('discard'); ctx.queue('draw', { count: (ctx.me.skillHistory ?? []).some(index => index > 0) ? 1 : 3 }); } },
    y_55: { onPlay: ctx => { ctx.me.skills = skillsFor(ctx.me.playable).map(skill => skill.uses); } },
    y_56: { keywords: ['taunt'], onPlay: ctx => step(ctx, 'exile', { count: 2 }), effect: (ctx, t) => exileDecks(ctx, t, true) },
    y_57: { keywords: ['hide'], onPlay(ctx) { ctx.queue('discard'); ctx.queue('draw'); }, onDiscarded: ctx => ctx.queue('randomDamage', { amount: 3 }) },
    y_58: { keywords: ['guard'], onDefend: (ctx, attacker) => ctx.buff(attacker, -2, -2) },
    y_59: {
        keywords: ['fast'],
        onEnter: ctx => step(ctx, 'roll'),
        onPlay(ctx) { ctx.s.queue.unshift({ op: 'cardEffect', actor: ctx.side, source: ctx.uid, step: 'pay' }); },
        effect(ctx, t) {
            if (t.step === 'pay') {
                if (!t.target) return ctx.ask('自分のお菓子を4減らしますか？', [{ id: 'no', label: '減らさない' }, { id: 'yes', label: '4減らす' }], t);
                if (t.target === 'yes') ctx.losePoints(ctx.side, 4, 'reduce');
            } else if (t.step === 'roll') ctx.die({ ...t, step: 'buff' });
            else { ctx.buff(ctx.uid, t.value ?? 0, 0); if (ctx.me.points <= 5) ctx.addKeyword(ctx.uid, 'pierce'); }
        },
    },
    y_60: {
        onPlay: ctx => step(ctx, 'reveal'),
        effect(ctx, t) { revealStep(ctx, t, uid => ctx.defOf(uid).type === 'yojo', () => {
            for (const uid of ctx.me.hand.filter(uid => ctx.s.cards[uid].revealed && ctx.defOf(uid).type === 'yojo')) ctx.s.cards[uid].fruitTypes = Array.from(new Set([...(ctx.s.cards[uid].fruitTypes ?? []), 'strawberry']));
            if (revealedUnits(ctx, 'strawberry').length >= 5 && ctx.foe.field.length) ctx.destroy(ctx.foe.field[ctx.random(ctx.foe.field.length)]);
        }); },
    },
    y_61: {
        keywords: ['taunt'],
        onPlay(ctx) {
            const n = ctx.me.played.filter(id => ctx.catalog[id]?.type === 'sweet' && !['back_menu', 'currency'].includes(ctx.catalog[id].sweetType ?? '') && id !== 's_38').length;
            if (n >= 12) { ctx.s.winner = ctx.side; return; }
            step(ctx, 'recover', { count: n >= 7 ? 4 : 2, amount: n >= 7 ? 1 : 0 });
        },
        effect(ctx, t) {
            if (t.target) { take(ctx, t.target, 'nap', false, !!t.amount); t = { ...t, target: undefined, count: t.count! - 1 }; }
            if ((t.count ?? 0) > 0) ctx.pick('手札に戻すお菓子', ctx.me.nap.filter(uid => ctx.isRealSweet(uid)), t);
        },
    },
    y_62: { keywords: ['hide', 'destroyImmune'], onEnter(ctx) { ctx.queue('randomDamage', { amount: 3 }); ctx.queue('steal', { amount: 3 }); } },
    y_63: {
        onPlay(ctx) { ctx.queue('draw'); step(ctx, 'reveal'); },
        effect(ctx, t) { revealStep(ctx, t, () => true, () => {
            ctx.queue('reduce', { amount: revealedUnits(ctx, 'grape').length });
            ctx.queue('heal', { amount: revealedUnits(ctx, 'strawberry').length });
            ctx.queue('allDamage', { amount: ctx.me.hand.filter(uid => ctx.s.cards[uid].revealed && ctx.isRealSweet(uid)).length });
        }); },
    },
    y_64: { effect: (ctx, t) => exileDecks(ctx, t) },
};
