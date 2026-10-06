// いちご（strawberry）の幼女カード。各カードの原文は src/data/yojo.json / tokenYojo.json。
import type { CardContext } from '../effects/context.ts';
import type { CardScript, CardScripts } from './types.ts';

const onField = (ctx: CardContext, cardId: string) => ctx.me.field.some(uid => ctx.s.cards[uid].cardId === cardId);

/** うゆち系: このバトル中に手札から場に出した「うゆち」が既に5枚以上なら +3/+3 して早食い。 */
const uyuchi = (next?: string): CardScript => ({
    onPlay(ctx) {
        const count = ctx.me.played.filter(id => ctx.catalog[id]?.name.includes('うゆち') && ctx.catalog[id].fruit === 'strawberry').length;
        if (count >= 5) {
            ctx.buff(ctx.uid, 3, 3);
            ctx.addKeyword(ctx.uid, 'fast');
        }
    },
    // 破壊されたとき、次の段階のうゆちを手札に加える。
    onDestroyed: next ? ctx => ctx.queue('addHand', { cardId: next }) : undefined,
});

/** さら / みゅーとん: 選んだ幼女を破壊し、同名の幼女を自分の場に出す。破壊できなくても複製する（FAQ ②-1）。 */
/** さら / みゅーとん: 「他の」幼女を1人破壊し、同名の幼女を自分の場に出す。自分自身は選べない（`ids` は選べない幼女）。 */
const copier = (scope: 'friendly' | 'any'): CardScript => ({ onPlay: ctx => ctx.queue('copy', { scope, ids: [ctx.uid] }) });

export const strawberryYojo: CardScripts = {
    // y_0 かがり: 1ターン目なら1枚引く。2ターン目以降は残りPPを全て消費して +X/+X。
    y_0: {
        onPlay(ctx) {
            if (ctx.me.turns === 1) {
                ctx.queue('draw');
                return;
            }
            ctx.buff(ctx.uid, ctx.me.pp, ctx.me.pp);
            ctx.me.pp = 0;
        },
    },
    // y_1 とここ: 挑発。自分の場に新たに出た幼女は +1/-1。
    y_1: { keywords: ['taunt'], onAllyEnter: (ctx, ally) => ctx.buff(ally, 1, -1) },
    // y_2 うゆち → yt_0 少女うゆち → yt_1 美女うゆち
    y_2: uyuchi('yt_0'),
    yt_0: uyuchi('yt_1'),
    yt_1: uyuchi(),
    // y_3 うぃまる: 防衛。場にいる間にお菓子カードをプレイすると「1度だけ受けたダメージを0にする」（重複しない）。
    y_3: {
        keywords: ['guard'],
        onOwnerPlayed(ctx, played, zone) {
            if (zone === 'field' && ctx.isRealSweet(played)) ctx.card.shield = true;
        },
    },
    // y_4 えーりん: 突撃。破壊されたとき1枚引く。
    y_4: { keywords: ['charge'], onDestroyed: ctx => ctx.queue('draw') },
    // y_5 かんらん: 手札を1枚捨て、1枚引く。手札から直接捨てられたときも1枚引く。
    y_5: {
        onPlay(ctx) {
            ctx.queue('discard');
            ctx.queue('draw');
        },
        onDiscarded: ctx => ctx.queue('draw'),
    },
    // y_6 ほーずき: 1枚引く。幼女カードなら +1/0。
    y_6: {
        onPlay: ctx => ctx.queue('draw'),
        onDrawn(ctx, { kind, uid }) {
            if (uid && kind === 'yojo') ctx.buff(ctx.uid, 1, 0);
        },
    },
    // y_7 レンテ: 破壊されたとき猫まんじゅうを出す。
    y_7: { onDestroyed: ctx => ctx.queue('summon', { cardId: 'token_cat' }) },
    // y_8 ちょり: 防衛。1枚引く。お菓子デッキから引いたなら 0/+2。
    y_8: {
        keywords: ['guard'],
        onPlay: ctx => ctx.queue('draw'),
        onDrawn(ctx, { kind, uid }) {
            if (uid && kind === 'sweet') ctx.buff(ctx.uid, 0, 2);
        },
    },
    // y_9 ぷらむ: 相手の幼女1人に2ダメージ。
    y_9: { onPlay: ctx => ctx.queue('damage', { scope: 'enemy', amount: 2 }) },
    // y_10 ゼロオレンジ: 破壊されたときランダムな相手の幼女に2ダメージ。
    y_10: { onDestroyed: ctx => ctx.queue('randomDamage', { amount: 2 }) },
    // y_11 もなか: 自分のお菓子を2減らす。破壊されたとき自分の幼女すべてに1ダメージ、お菓子を2回復。
    y_11: {
        onPlay: ctx => ctx.queue('reduce', { scope: 'friendly', amount: 2 }),
        onDestroyed(ctx) {
            ctx.queue('allDamage', { scope: 'friendly', amount: 1 });
            ctx.queue('heal', { amount: 2 });
        },
    },
    // y_12 あみの: 最大PP+1。既に7以上ならランダムな相手に2ダメージ、さらに10以上ならお菓子を2奪う。
    y_12: {
        onPlay(ctx) {
            const before = ctx.maxPp();
            ctx.me.ppBonus++;
            if (before >= 7) ctx.queue('randomDamage', { amount: 2 });
            if (before >= 10) ctx.queue('steal', { amount: 2 });
        },
    },
    // y_13 がと: 早食い。挑発。場に出たとき +X/0（X は自分のお昼寝場所のがとの数）。
    y_13: {
        keywords: ['fast', 'taunt'],
        onEnter: ctx => ctx.buff(ctx.uid, ctx.me.nap.filter(uid => ctx.s.cards[uid].cardId === 'y_13').length, 0),
    },
    // y_14 ももか: 店長または副店長を公開してデッキから手札に加える。
    // 裁定: 山札の上からめくり、最初に出た該当カードを加え、残りはシャッフルする。
    y_14: {
        onPlay: ctx => ctx.queue('searchRole'),
        ops: {
            searchRole: {
                run(fx) {
                    const found = fx.me.yojo.find(uid => ['manager', 'assistant_manager'].includes(fx.defOf(uid).role ?? ''));
                    if (found) {
                        fx.me.yojo = fx.me.yojo.filter(uid => uid !== found);
                        fx.me.hand.push(found);
                        fx.s.cards[found].revealed = true;
                    }
                    fx.shuffleDeck('yojo');
                },
            },
        },
    },
    // y_15 まこぽに: 早食い。いのむーが場にいれば2コスト扱い、+1/+1。
    // +1/+1 は「手札から」に限らないので、さらの複製などで出たときも乗る。
    y_15: {
        keywords: ['fast'],
        baseCost: (s, side) => s.players[side].field.some(uid => s.cards[uid].cardId === 'y_16') ? 2 : undefined,
        onEnter(ctx) {
            if (onField(ctx, 'y_16')) ctx.buff(ctx.uid, 1, 1);
        },
    },
    // y_16 いのむー: 防衛。場にいる状態でまこぽにが出たとき +1/+1。
    y_16: {
        keywords: ['guard'],
        onAllyEnter(ctx, ally) {
            if (ctx.s.cards[ally].cardId === 'y_15') ctx.buff(ctx.uid, 1, 1);
        },
    },
    // y_17 まめろん: 防衛。お菓子を食べられない。
    y_17: { keywords: ['guard', 'noEat'] },
    // y_18 ぎってぃ: 1d6の半分の枚数を捨てる。1枚以上で相手の手札2枚をランダムに捨てさせ、2枚以上で突撃、3枚以上で2枚引く。
    y_18: {
        onPlay(ctx) {
            const roll = ctx.rollDie(), count = Math.floor(roll / 2);
            ctx.note(`ぎってぃのダイス：${roll}（${count ? `${count}枚捨てる` : '0枚なので何も起きない'}）`);
            // count: still to discard, amount: discarded so far.
            ctx.queue('diceDiscard', { count, amount: 0 });
        },
        ops: {
            diceDiscard: {
                run(fx, t) {
                    if (t.target) {
                        fx.discard(t.target);
                        t = { ...t, target: undefined, count: (t.count ?? 0) - 1, amount: (t.amount ?? 0) + 1 };
                    }
                    if ((t.count ?? 0) > 0 && fx.me.hand.length) {
                        fx.pick(`あと${t.count}枚捨てます（ダイス結果）`, fx.me.hand, t);
                        return;
                    }
                    const discarded = t.amount ?? 0;
                    if (discarded >= 1) {
                        for (let i = 0; i < 2 && fx.foe.hand.length; i++) fx.discard(fx.foe.hand[fx.random(fx.foe.hand.length)], fx.foeSide);
                    }
                    if (discarded >= 2 && t.source) fx.addKeyword(t.source, 'charge');
                    if (discarded >= 3) fx.next({ op: 'draw', actor: t.actor, source: t.source, count: 2 });
                },
            },
        },
    },
    // y_19 さら: 自分の場の他の幼女1人を破壊し、同名の幼女を自分の場に出す。
    y_19: copier('friendly'),
    // y_20 ふろんとさん: 突撃。攻撃時、相手のお菓子を2個食べる。
    y_20: { keywords: ['charge'], onAttack: ctx => ctx.eat(ctx.uid, 2) },
    // y_21 しゅお: 突撃。攻撃時、ダメージを与えあう前に相手幼女に3ダメージ。お菓子を1回復。
    y_21: {
        keywords: ['charge'],
        onAttack(ctx, target) {
            if (target !== 'leader') ctx.damage(target, 3);
            ctx.heal(1);
        },
    },
    // y_22 ゆうひ: お菓子を2回復、1枚引く。
    y_22: {
        onPlay(ctx) {
            ctx.queue('heal', { amount: 2 });
            ctx.queue('draw');
        },
    },
    // y_23 ふらら: 防衛。お菓子を2回復。
    y_23: { keywords: ['guard'], onPlay: ctx => ctx.queue('heal', { amount: 2 }) },
    // y_24 りくす: 直前の相手ターンにお菓子を食べた幼女をすべて破壊。破壊が1人以下ならPPを1、お菓子を1回復。
    y_24: {
        onPlay(ctx) {
            const ate = ctx.foe.field.filter(uid => ctx.s.cards[uid].ateOn === ctx.s.turn - 1 && !ctx.s.cards[uid].keywords.includes('effectImmune'));
            ate.forEach(uid => ctx.destroy(uid));
            if (ate.length <= 1) {
                ctx.queue('pp', { amount: 1 });
                ctx.queue('heal', { amount: 1 });
            }
        },
    },
    // y_25 ストラ: 早食い。貫通。
    y_25: { keywords: ['fast', 'pierce'] },
    // y_26 しゅれい: ①相手の幼女すべてに2ダメージ ②相手の幼女2人に4ダメージ、から選ぶ。
    y_26: {
        onPlay: ctx => ctx.queue('shurei'),
        ops: {
            shurei: {
                run(fx, t) {
                    if (!t.target) {
                        fx.ask('しゅれいの効果を選んでください', [{ id: 'all', label: '相手全員に2ダメージ' }, { id: 'two', label: '相手2人に4ダメージ' }], t);
                        return;
                    }
                    const all = t.target === 'all';
                    fx.next({ ...t, op: all ? 'allDamage' : 'damage', amount: all ? 2 : 4, count: all ? 1 : 2, target: undefined, scope: 'enemy' });
                },
                cpu: fx => fx.foe.field.length >= 3 ? 'all' : 'two',
            },
        },
    },
    // y_27 オフティ二: 手札を1枚捨てる。お菓子を2回復。2枚引く。2枚とも幼女ならPPを1回復。
    // 裁定: 手札がなくても捨てる以外の処理は行う。
    y_27: {
        onPlay(ctx) {
            ctx.queue('discard');
            ctx.queue('heal', { amount: 2 });
            ctx.queue('draw', { count: 2 });
        },
        onDrawn(ctx, { drawn, done }) {
            if (done && drawn.length === 2 && drawn.every(uid => ctx.defOf(uid).type === 'yojo')) ctx.gainPp(1);
        },
    },
    // y_28 じょんこ: 挑発。カードの効果で破壊されず、ダメージを受けない（攻撃のダメージは受ける）。
    y_28: { keywords: ['taunt', 'effectImmune'] },
    // y_29 いろは: 挑発。自分と相手のお菓子ポイントを入れ替えるようにダメージと回復を行う。
    y_29: {
        keywords: ['taunt'],
        onPlay(ctx) {
            const own = ctx.me.points, enemy = ctx.foe.points;
            const [loser, gainer] = own > enemy ? [ctx.side, ctx.foeSide] : [ctx.foeSide, ctx.side];
            ctx.losePoints(loser, Math.abs(own - enemy), 'reduce');
            ctx.heal(Math.abs(own - enemy), gainer);
        },
    },
    // y_30 みゅーとん: 場の他の幼女1人を破壊し、同名の幼女を自分の場に出す。
    y_30: copier('any'),
};
