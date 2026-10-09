import type { CardScripts } from './types.ts';
import { attackOf } from '../core/cards.ts';
import { gainEx, napCost, napUnits, revealStep, revive, step, take } from './helpers.ts';

const namesOnFieldOrNap = (ctx: Parameters<NonNullable<CardScripts[string]['onPlay']>>[0], name: string) => [...ctx.me.field, ...ctx.me.nap].some(uid => ctx.defOf(uid).name.includes(name));

export const orangeYojo: CardScripts = {
    y_113: {
        onPlay: ctx => step(ctx, 'search'),
        effect(ctx, t) { if (!t.target) ctx.pick('猫のお菓子を選んでください', ctx.me.sweet.filter(uid => /猫|ねこ/.test(ctx.defOf(uid).name)), t); else take(ctx, t.target, 'sweet', true, true); },
    },
    y_114: { keywords: ['hide'], onTurnStart(ctx, active, zone) { if (active !== ctx.side && zone === 'field') { if (ctx.me.pp >= 1) ctx.queue('draw'); if (ctx.me.pp >= 3) ctx.queue('randomDamage', { amount: 3 }); } } },
    y_115: { onPlay(ctx) { const uid = ctx.summon('token_mochida'); if (uid) ctx.bounce(uid); } },
    y_116: { onPlay: ctx => ctx.queue('draw'), onExiled: ctx => ctx.queue('reduce', { amount: 2 }) },
    y_117: {
        onDestroyed: ctx => ctx.queue('summon', { cardId: 'token_cat' }),
        onExiled: ctx => step(ctx, 'mode'),
        effect(ctx, t) { if (!t.target) ctx.ask('なかよしの除外時効果', [{ id: 'damage', label: '相手幼女1人に3ダメージ' }, { id: 'draw', label: '1枚引く' }], t); else ctx.queue(t.target === 'damage' ? 'damage' : 'draw', { amount: 3 }); },
    },
    y_118: { keywords: ['taunt'], onDestroyed: ctx => ctx.queue('draw'), onTurnEnd: ctx => { ctx.me.pp = Math.min(12, ctx.me.pp + 4); } },
    y_119: {
        onPlay: ctx => step(ctx, 'search'),
        effect(ctx, t) { if (!t.target) ctx.pick('フロートを選んでください', ctx.me.sweet.filter(uid => ctx.defOf(uid).name.includes('フロート')), t); else take(ctx, t.target, 'sweet', true, true); },
    },
    y_120: { keywords: ['taunt'], onPlay(ctx) { ctx.queue('draw'); if (ctx.side !== ctx.s.rules.firstPlayer && !ctx.playedBefore('y_120')) ctx.me.ppBonus++; } },
    y_121: { onPlay(ctx) { if (namesOnFieldOrNap(ctx, 'ゼロオレ')) gainEx(ctx, 'strawberryHunt', 1); } },
    y_122: { onPlay: ctx => { ctx.foe.skipDraw = (ctx.foe.skipDraw ?? 0) + 1; } },
    y_123: { keywords: ['guard'], onPlay(ctx) { if (namesOnFieldOrNap(ctx, 'いろは')) gainEx(ctx, 'healing', 3); } },
    y_124: { onTurnStart(ctx, active, zone) { if (active !== ctx.side && zone === 'field' && ctx.me.pp >= 4) ctx.me.ppBonus++; } },
    // y_125 ようかん: 2枚引く。その後、自分のターンを終了する。
    // ターンの終了は、味方の反応（とここの+1/-1など）まで終わってから。
    y_125: { onPlay: ctx => ctx.queue('draw', { count: 2 }), afterPlay(ctx) { ctx.queue('trimHand'); ctx.queue('endEffects'); } },
    y_126: {
        onPlay: ctx => step(ctx, 'declare'),
        effect(ctx, t) {
            if (!t.target) return ctx.ask('幼女名とフルーツタイプを宣言してください', Object.values(ctx.catalog).filter(c => c.type === 'yojo').map(c => ({ id: c.id, label: `${c.name}（${c.fruit}）` })), t);
            const top = ctx.me.yojo[0];
            if (top && ctx.s.cards[top].cardId === t.target) take(ctx, top, 'yojo', false, true);
            else ctx.shuffleDeck('yojo');
        },
    },
    y_127: { keywords: ['guard', 'evade'], evasion: 5, onEvade(ctx, attacker) { const n = attackOf(ctx.s.cards[attacker], ctx.catalog); ctx.damage(attacker, n); ctx.eat(ctx.uid, n); } },
    y_128: {
        onPlay: ctx => step(ctx, 'pick', { candidates: ctx.me.yojo.slice(0, 4), ids: [] }),
        effect(ctx, t) {
            if (t.step === 'pick') {
                if (!t.candidates?.length) { ctx.shuffleDeck('yojo'); return; }
                if (!t.target) return ctx.pick('山上4枚から振り分けるカードを選んでください', t.candidates, t);
                step(ctx, 'zone', { ...t, target: undefined, step: 'zone', subject: t.target });
            } else {
                if (!t.target) return ctx.ask('このカードの行き先を選んでください', ['hand', 'yojo', 'nap', 'exile'].filter(id => !(t.ids ?? []).includes(id)).map(id => ({ id, label: ({ hand: '手札', yojo: '幼女デッキ', nap: 'お昼寝場所', exile: '除外ゾーン' } as Record<string, string>)[id] })), t);
                const uid = t.subject!;
                if (t.target === 'exile') ctx.exile(uid);
                else if (t.target !== 'yojo') { ctx.me.yojo = ctx.me.yojo.filter(id => id !== uid); ctx.me[t.target as 'hand' | 'nap'].push(uid); }
                step(ctx, 'pick', { candidates: t.candidates?.filter(id => id !== uid), ids: [...(t.ids ?? []), t.target] });
            }
        },
    },
    y_129: {
        keywords: ['guard'],
        onPlay(ctx) { ctx.queue('heal', { amount: 1 }); step(ctx, 'search'); },
        effect(ctx, t) {
            if (t.step === 'search') {
                if (!t.target) return ctx.pick('Exスキルを含むカードを選んでください', [...ctx.me.yojo, ...ctx.me.sweet].filter(uid => (ctx.defOf(uid).effect ?? '').includes('Exスキル')), t);
                const uid = t.target; take(ctx, uid, ctx.me.yojo.includes(uid) ? 'yojo' : 'sweet', true);
                ctx.die({ ...t, target: undefined, step: 'discount', subject: uid });
            } else if ((t.value ?? 0) >= 5) ctx.s.cards[t.subject!].costDelta--;
        },
    },
    y_130: {
        onPlay: ctx => step(ctx, 'offer'),
        effect(ctx, t) {
            const eligible = napUnits(ctx).filter(uid => ctx.s.cards[uid].cardId !== 'y_146');
            if (t.step === 'offer') {
                if (eligible.length < 2) return;
                if (!t.target) return ctx.ask('お昼寝場所の幼女2人を除外して+2/+2と1ドロー？', [{ id: 'no', label: '除外しない' }, { id: 'yes', label: '2人除外する' }], t);
                if (t.target === 'yes') step(ctx, 'exileNap', { count: 2 });
            } else {
                if (t.target) { ctx.exile(t.target); t = { ...t, target: undefined, count: t.count! - 1 }; }
                if (t.count! > 0) ctx.pick('除外する幼女を選んでください', eligible.filter(uid => ctx.me.nap.includes(uid)), t);
                else { ctx.queue('draw'); ctx.queue('buff', { target: ctx.uid, amount: 2, hp: 2 }); }
            }
        },
    },
    y_131: { keywords: ['charge'], onPlay(ctx) { ctx.queue('draw', { count: 2 }); ctx.queue('discard'); }, onDestroyed: ctx => ctx.queue('discard') },
    y_132: { keywords: ['charge'], onPlay: ctx => gainEx(ctx, 'abyss', 2) },
    y_133: { onPlay(ctx) { for (let i = 0; i < 2 && ctx.me.yojo.length; i++) ctx.exile(ctx.me.yojo[ctx.random(ctx.me.yojo.length)]); } },
    y_134: { onPlay(ctx) { for (let i = 0; i < (ctx.me.mochidaLeft ?? 0); i++) ctx.me.hand.push(ctx.spawn('token_mochida')); } },
    y_135: {
        keywords: ['taunt'], onPlay: ctx => step(ctx, 'revive'),
        effect(ctx, t) { if (!t.target) ctx.pick('場に出す幼女（コスト5以下）', napUnits(ctx).filter(uid => napCost(ctx, uid) <= 5), t); else revive(ctx, t.target); },
    },
    y_136: {
        onPlay: ctx => step(ctx, 'exileHand', { count: 2 }),
        effect(ctx, t) {
            if (t.target) { ctx.exile(t.target); t = { ...t, target: undefined, count: t.count! - 1 }; }
            if (t.count! > 0 && ctx.me.hand.length) ctx.pick('除外する手札を選んでください', ctx.me.hand, t);
            else ctx.queue('draw', { count: 3 });
        },
    },
    y_137: {
        keywords: ['charge'], onPlay: ctx => step(ctx, 'search', { count: 2 }),
        effect(ctx, t) {
            if (t.target) { take(ctx, t.target, 'sweet', true); ctx.s.cards[t.target].costDelta--; t = { ...t, target: undefined, count: t.count! - 1 }; }
            if (t.count! > 0) ctx.pick('ぷぷりえ焼きを選んでください', ctx.me.sweet.filter(uid => ctx.defOf(uid).sweetType === 'pplale_yaki'), t);
        },
    },
    y_138: { onPlay: ctx => ctx.queue('summon', { cardId: 'token_mochida', count: 2 }), onExiled: ctx => ctx.queue('summon', { cardId: 'token_mochida', count: 2 }) },
    y_139: {
        onPlay: ctx => ctx.die({ op: 'cardEffect', actor: ctx.side, source: ctx.uid, step: 'buff' }),
        effect(ctx, t) { const n = (t.value ?? 0) >= 6 ? 4 : (t.value ?? 0) >= 4 ? 2 : 0; ctx.buff(ctx.uid, n, n); },
    },
    y_140: { onPlay(ctx) { gainEx(ctx, 'dagger', 1, ctx.me, false); ctx.gainPp(1); } },
    y_141: { onEnter: ctx => ctx.gainPp(4), onTurnStart(ctx, active, zone) { if (active !== ctx.side && zone === 'field' && ctx.me.pp >= 4 && ctx.foe.field.length) ctx.destroy(ctx.foe.field[ctx.random(ctx.foe.field.length)]); } },
    y_142: { keywords: ['guard'], onEnter(ctx) { if (Object.keys(ctx.me.exSkills ?? {}).length >= 3) { ctx.gainPp(3); gainEx(ctx, 'alice', 1, ctx.me, false); } } },
    y_143: { onPlay: ctx => gainEx(ctx, 'smoke', 1, ctx.foe, false) },
    y_144: {
        keywords: ['pierce'], onEnter: ctx => step(ctx, 'reveal'),
        effect(ctx, t) { revealStep(ctx, t, uid => /うさぎ|ラビット/.test(ctx.defOf(uid).name), () => { const n = ctx.me.hand.filter(uid => ctx.s.cards[uid].revealed && /うさぎ|ラビット/.test(ctx.defOf(uid).name)).length; if (n) ctx.eat(ctx.uid, n); }); },
    },
    y_145: { keywords: ['guard', 'colorOrange', 'destroyImmune'], onDestroyed(ctx) { if (ctx.card.destroyedBy) ctx.queue('reduce', { amount: attackOf(ctx.s.cards[ctx.card.destroyedBy], ctx.catalog) }); } },
    y_146: { onEnter(ctx) { const costs = new Set(napUnits(ctx).map(uid => napCost(ctx, uid))); if (Array.from({ length: 10 }, (_, i) => i + 1).every(n => costs.has(n))) ctx.s.winner = ctx.side; } },
    y_147: { keywords: ['fast'], onAttack: ctx => ctx.queue('allDamage', { amount: 2 }) },
    y_148: { revealable: true, onEnter: ctx => ctx.queue('reduce', { amount: 3 }), onTurnStart(ctx, active, zone) { if (active !== ctx.side && zone === 'hand' && ctx.card.revealed && ctx.me.pp >= 4) ctx.card.costDelta -= 2; } },
    y_149: { keywords: ['fast'], revealable: true, onOwnerPlayed(ctx, played, zone) { if (zone === 'hand' && ctx.card.revealed && ctx.isRealSweet(played)) ctx.card.costDelta--; } },
    y_150: { keywords: ['guard'], revealable: true, onOwnerPlayed(ctx, played, zone) { if (zone === 'hand' && ctx.card.revealed && ctx.isRealSweet(played)) ctx.card.costDelta--; }, onPlay(ctx) { ctx.queue('draw', { deck: 'sweet', count: 2 }); ctx.queue('pp', { amount: 3 }); } },
};
