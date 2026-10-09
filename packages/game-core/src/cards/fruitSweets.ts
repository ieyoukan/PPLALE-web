import type { CardScript, CardScripts } from './types.ts';
import { selectable } from '../effects/targets.ts';
import { step, take } from './helpers.ts';

const chaiCount = (played: string[], id: string) => new Set([...played, id].filter(id => /^s_(28|29|30|31)$/.test(id))).size;
const chai: CardScript = {
    canPlay: ctx => selectable(ctx.s, ctx.side, ctx.foe.field, chaiCount(ctx.me.played, ctx.def.id) >= 3).length > 0,
    onPlay(ctx) {
        const n = chaiCount(ctx.me.played, ctx.def.id);
        ctx.queue(n === 1 ? 'destroy' : 'exile', { scope: 'enemy', ignoreAvoidance: n >= 3 });
        if (n === 1) ctx.queue('pp', { amount: 1 });
        if (n >= 3) ctx.queue('draw');
        if (n >= 4) ctx.queue('steal', { amount: 3 });
    },
};

const ice = (gain: number): CardScript => ({
    canPlay: ctx => ctx.def.id !== 's_36' || ctx.me.turns >= 6,
    onPlay(ctx) { ctx.me.ice = (ctx.me.ice ?? 0) + gain * ctx.multiplier; step(ctx, 'spend'); },
    effect(ctx, t) {
        const kind = ctx.def.id;
        const spend = (n: number) => { ctx.me.ice = (ctx.me.ice ?? 0) - n; };
        if (t.step === 'extraDamage') {
            if (!t.target && (ctx.me.ice ?? 0) >= 1) return ctx.ask('追加でアイス1を消費してランダムに3ダメージ？', [{ id: 'no', label: '消費しない' }, { id: 'yes', label: 'アイス1を消費' }], t);
            if (t.target === 'yes') { spend(1); ctx.queue('randomDamage', { amount: 3 }); }
            return;
        }
        if (!t.target) {
            const stock = ctx.me.ice ?? 0;
            const choices = kind === 's_32' || kind === 's_36' ? Array.from({ length: stock + 1 }, (_, i) => i) : kind === 's_35' ? [0, 4, 8].filter(n => n <= stock) : [0, 2].filter(n => n <= stock);
            return ctx.ask('消費するアイスカウントを選んでください', choices.map(n => ({ id: String(n), label: n ? `アイス${n}を消費` : '消費しない' })), t);
        }
        const n = Number(t.target);
        if (!n) return;
        spend(n);
        if (kind === 's_32') ctx.queue('damage', { amount: n, scope: 'enemy' });
        if (kind === 's_33') { ctx.queue('damage', { amount: 2 }); ctx.queue('draw'); }
        if (kind === 's_34') { ctx.queue('allDamage', { amount: 2 }); step(ctx, 'extraDamage'); }
        if (kind === 's_35') ctx.queue('buff', { scope: 'friendly', amount: n === 8 ? 6 : 3, hp: n === 8 ? 6 : 3 });
        if (kind === 's_36') ctx.queue('reduce', { amount: n });
    },
});

const soda = (fruit: string): CardScript => ({
    onPlay(ctx) {
        for (const uid of [...ctx.me.hand, ...ctx.me.yojo, ...ctx.me.nap].filter(uid => ctx.defOf(uid).type === 'yojo')) ctx.s.cards[uid].fruitTypes = Array.from(new Set([...(ctx.s.cards[uid].fruitTypes ?? []), fruit]));
        step(ctx, 'pay');
    },
    effect(ctx, t) {
        if (t.step === 'pay') {
            if (ctx.me.pp < 1) return;
            if (!t.target) return ctx.ask('追加1PPで幼女を手札に加えますか？', [{ id: 'no', label: '加えない' }, { id: 'yes', label: '1PP払って選ぶ' }], t);
            if (t.target === 'yes') { ctx.me.pp--; step(ctx, 'search'); }
        } else if (!t.target) ctx.pick('手札に加える幼女', ctx.me.yojo.filter(uid => ctx.fruits(uid).includes(fruit)), t);
        else take(ctx, t.target, 'yojo');
    },
});

export const fruitSweets: CardScripts = {
    s_28: chai, s_29: chai, s_30: chai, s_31: chai,
    s_32: ice(1), s_33: ice(2), s_34: ice(3), s_35: ice(4), s_36: ice(4),
    s_37: { onPlay: ctx => ctx.queue('draw') },
    s_38: {
        onPlay: ctx => step(ctx, 'photo'),
        effect(ctx, t) {
            if (!t.target) return ctx.ask('「いっしょにおしゃしん」の条件を達成しましたか？', [{ id: 'no', label: '達成していない' }, { id: 'yes', label: '達成した：双方1ドロー' }], t);
            if (t.target === 'yes') { ctx.queue('draw'); ctx.queue('draw', { actor: ctx.foeSide }); }
        },
    },
    s_39: soda('melon'), s_40: soda('grape'),
    s_41: { onPlay(ctx) { ctx.queue('allDamage', { amount: 1 }); ctx.queue('reduce', { amount: 1 }); if (ctx.playedBefore('s_42')) ctx.queue('reduce', { amount: 1 }); } },
    s_42: { onPlay(ctx) { ctx.queue('allBuff', { scope: 'friendly', hp: 1 }); ctx.queue('heal', { amount: 1 }); if (ctx.playedBefore('s_41')) ctx.queue('heal', { amount: 1 }); } },
    s_43: {
        onPlay: ctx => step(ctx, 'search', { count: 2, ids: [] }),
        effect(ctx, t) {
            if (t.target) { take(ctx, t.target, 'yojo'); t = { ...t, target: undefined, count: t.count! - 1, ids: [...(t.ids ?? []), ctx.s.cards[t.target].cardId] }; }
            const members = ['りくす', 'ゆに', 'ビデカメ', 'よみ', 'おうか', 'がと', 'キラチャン', 'ぶらんちゃん', 'ようかん', 'ひらくぅ。'];
            if (t.count! > 0) ctx.pick('電脳青春文化祭メンバーを選んでください', ctx.me.yojo.filter(uid => members.includes(ctx.defOf(uid).name) && !(t.ids ?? []).includes(ctx.s.cards[uid].cardId)), t);
        },
    },
    s_44: {
        revealable: true,
        canPlay: ctx => ctx.me.field.length > 0,
        onReveal(ctx) { const kinds = new Set(ctx.me.nap.filter(uid => ['りくす', 'ストラ', 'まめろん', 'がと'].includes(ctx.defOf(uid).name)).map(uid => `${ctx.defOf(uid).name}:${ctx.defOf(uid).fruit}`)); ctx.card.costDelta -= kinds.size; },
        onPlay: ctx => ctx.queue('buff', { scope: 'friendly', amount: 8, hp: 10 }),
    },
    s_45: { onPlay: ctx => { ctx.me.acorns = (ctx.me.acorns ?? 0) + 1; } },
};
