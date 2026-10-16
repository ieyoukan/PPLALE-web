// メロン（melon）の幼女カード。各カードの原文は src/data/yojo.json。
// 読み方を決めきれない文は docs/open-questions.md の「5. メロン」に、今の実装とともにまとめてある。
import type { CardContext } from '../effects/context.ts';
import type { CardScripts } from './types.ts';
import { attackOf, availablePpMaximum, costOf, hpOf } from '../core/cards.ts';
import { selectable } from '../effects/targets.ts';
import { skillsFor } from '../playables/skills.ts';
import { gainEx, napCost, napUnits, revealStep, revive, step, take } from './helpers.ts';

const named = (ctx: CardContext, uid: string, name: string) => ctx.defOf(uid).name.includes(name);
const rabbit = (ctx: CardContext, uid: string) => /うさぎ|ラビット/.test(ctx.defOf(uid).name);
const isCat = (ctx: CardContext, uid: string) => ctx.s.cards[uid].cardId === 'token_cat';
const others = (ctx: CardContext) => ctx.me.field.filter(uid => uid !== ctx.uid);
/** A token is any card that is not a printed deck card (猫まんじゅう, もちだ, うゆちの派生, お仕置き棒 …). */
const isToken = (cardId: string) => !/^[sy]_\d+$/.test(cardId);
/** A unit's worth for the CPU's picks. */
const worth = (ctx: CardContext, uid: string) => attackOf(ctx.s.cards[uid], ctx.catalog) + Math.max(0, hpOf(ctx.s.cards[uid], ctx.catalog));
const cheapest = (ctx: CardContext, options: string[]) => [...options].filter(id => ctx.s.cards[id]).sort((a, b) => costOf(ctx.s, a, ctx.catalog, ctx.side) - costOf(ctx.s, b, ctx.catalog, ctx.side))[0];
/** お昼寝場所の幼女 that an effect can exile (ちむどんどん！ stays). */
const exilableNap = (ctx: CardContext, fruit?: string) => napUnits(ctx).filter(uid => !(ctx.s.cards[uid].cardId === 'y_146' && !ctx.s.cards[uid].silenced) && (!fruit || ctx.fruits(uid).includes(fruit)));
/** A random 幼女 of the 幼女デッキ that fits, shown and put into the hand. */
function randomSearch(ctx: CardContext, fits: (uid: string) => boolean) {
    const eligible = ctx.me.yojo.filter(fits);
    if (eligible.length) take(ctx, eligible[ctx.random(eligible.length)], 'yojo', true);
}
/** `count` もちだ into the hand, shown. */
function mochidaToHand(ctx: CardContext, count: number) {
    for (let i = 0; i < count; i++) {
        const uid = ctx.spawn('token_mochida');
        ctx.me.hand.push(uid);
        ctx.reveal(uid);
    }
}
/** ゼロオレンジ: 【レンス】 (of any fruit) on its owner's field, or shown in their hand. */
const lensWith = (ctx: CardContext) =>
    ctx.me.field.some(uid => ctx.defOf(uid).name === 'レンス')
    || ctx.me.hand.some(uid => ctx.s.cards[uid].revealed && ctx.defOf(uid).name === 'レンス');

/** メロンのちょり: the chosen unit is exiled (4 nap 幼女 were exiled) or 行動不能; its おにごっこ is rolled first. */
function finishChori(ctx: CardContext, target: string, exiled: boolean) {
    if (!ctx.foe.field.includes(target)) return;
    ctx.queue(exiled ? 'exile' : 'immobilize', { target, candidates: [target], selected: true, amount: 1 });
}

export const melonYojo: CardScripts = {
    // y_65 みか: うさぎ / ラビットのカードをデッキから手札に加える。手札のうさぎ / ラビット1枚を公開してコスト0。
    y_65: {
        onPlay: ctx => step(ctx, 'search'),
        effect(ctx, t) {
            if (t.step === 'search') {
                if (!t.target) {
                    const found = [...ctx.me.yojo, ...ctx.me.sweet].filter(uid => rabbit(ctx, uid));
                    if (found.length) return ctx.pick('手札に加える「うさぎ」「ラビット」のカード', found, t);
                } else take(ctx, t.target, ctx.me.yojo.includes(t.target) ? 'yojo' : 'sweet');
                step(ctx, 'zero');
            } else if (!t.target) ctx.pick('公開してコストを0にするカード', ctx.me.hand.filter(uid => rabbit(ctx, uid)), t);
            else {
                ctx.reveal(t.target);
                ctx.s.cards[t.target].costDelta = -ctx.defOf(t.target).cost;
            }
        },
    },
    // y_66 さら: 自分の場に他の幼女がいるなら、その1人を破壊し、幼女デッキとお菓子デッキから1枚ずつ引く。
    y_66: {
        onPlay(ctx) { if (others(ctx).length) step(ctx, 'destroy'); },
        effect(ctx, t) {
            if (!t.target) return ctx.pick('破壊する自分の幼女を選んでください', others(ctx), t);
            ctx.destroy(t.target);
            ctx.queue('draw', { deck: 'yojo' });
            ctx.queue('draw', { deck: 'sweet' });
        },
        cpu: { choose: (ctx, _t, options) => [...options].sort((a, b) => worth(ctx, a) - worth(ctx, b))[0] },
    },
    // y_67 ぎってぃ: 挑発。場の幼女1人の攻撃力と体力を入れ替える。
    // ぎってぃ自身は選べない（ユーザー裁定）。
    y_67: { keywords: ['taunt'], onPlay: ctx => ctx.queue('swapStats', { scope: 'any', candidates: [...ctx.me.field, ...ctx.foe.field].filter(uid => uid !== ctx.uid) }) },
    // y_68 みゅーとん: 自分の場の他の幼女と同名の幼女を、全ての能力を失った状態で自分の場に出す。
    y_68: {
        onPlay(ctx) { if (others(ctx).length) step(ctx, 'copy'); },
        effect(ctx, t) {
            if (!t.target) return ctx.pick('同名の幼女を出す自分の幼女を選んでください', others(ctx), t);
            ctx.summon(ctx.s.cards[t.target].cardId, true);
        },
    },
    // y_69 リマチャン: 自分の場の他の幼女1人を+4/+4し、突撃と「ターン終了時に除外・お菓子を食べられない」を付与する。
    y_69: {
        onPlay(ctx) { if (others(ctx).length) step(ctx, 'grant'); },
        effect(ctx, t) {
            if (!t.target) return ctx.pick('強化する自分の幼女を選んでください', others(ctx), t);
            if (!ctx.me.field.includes(t.target)) return;
            ctx.buff(t.target, 4, 4);
            for (const keyword of ['charge', 'exileAtEnd', 'noEat'] as const) ctx.addKeyword(t.target, keyword);
        },
    },
    // y_70 がと: 早食い。攻撃時、自分の場の他の幼女1人を手札に戻し、その攻撃力の半分だけ+X/+X。
    y_70: {
        keywords: ['fast'],
        onAttack(ctx) { if (others(ctx).length) step(ctx, 'bounce'); },
        effect(ctx, t) {
            if (!ctx.me.field.includes(ctx.uid)) return;
            if (!t.target) return ctx.pick('手札に戻す自分の幼女を選んでください', others(ctx), t);
            const x = Math.floor(attackOf(ctx.s.cards[t.target], ctx.catalog) / 2);
            ctx.bounce(t.target);
            ctx.buff(ctx.uid, x, x);
        },
    },
    // y_71 リンネ: 1枚引く。自分のお菓子ポイントを2減らしたなら、もう1枚引く。
    y_71: {
        onPlay(ctx) { ctx.queue('draw'); step(ctx, 'pay'); },
        effect(ctx, t) {
            // 減らすと負けるときも、引くカードがないときも聞く（ユーザー裁定）。
            if (!t.target) return ctx.ask('お菓子ポイントを2減らして、もう1枚引きますか？', [{ id: 'no', label: '減らさない' }, { id: 'yes', label: '2減らして1枚引く' }], t);
            if (t.target === 'yes') { ctx.losePoints(ctx.side, 2, 'reduce'); ctx.queue('draw'); }
        },
        cpu: { choose: ctx => ctx.me.points > 6 && ctx.me.yojo.length + ctx.me.sweet.length > 0 ? 'yes' : 'no' },
    },
    // y_72 うゆち: 猫まんじゅうを場に出し、公開状態で手札に加える。お昼寝場所の幼女が5人以上なら、公開状態の猫まんじゅう1体のコストを0。
    y_72: {
        onPlay(ctx) { ctx.queue('summon', { cardId: 'token_cat' }); step(ctx, 'cat'); },
        effect(ctx, t) {
            if (t.step === 'cat') {
                const cat = ctx.spawn('token_cat');
                ctx.me.hand.push(cat);
                ctx.reveal(cat);
                if (napUnits(ctx).length >= 5) step(ctx, 'free');
                return;
            }
            // 公開状態の猫まんじゅう1体を選ぶ（1体だけなら自動）。
            const cats = ctx.me.hand.filter(uid => isCat(ctx, uid) && ctx.s.cards[uid].revealed && costOf(ctx.s, uid, ctx.catalog, ctx.side) > 0);
            if (!t.target && cats.length > 1) return ctx.pick('コストを0にする公開状態の猫まんじゅうを選んでください', cats, t);
            const target = t.target ?? cats[0];
            if (target) ctx.s.cards[target].costDelta = -ctx.defOf(target).cost;
        },
    },
    // y_73 ゆうひ: 自分のターン終了時、お菓子を1回復し、PPを全回復する（相手のターンに使えるよう残す）。
    y_73: {
        onTurnEnd(ctx) {
            ctx.queue('heal', { amount: 1 });
            // 「全回復」: up to the max PP, without taking away PP already above it (さおちゃん etc.).
            ctx.me.pp = Math.max(ctx.me.pp, availablePpMaximum(ctx.s, ctx.side));
        },
    },
    // y_74 ゼロオレンジ: 行動不能。場に出たとき場か公開した手札にレンスがいれば行動でき、早食い。破壊されたとき相手のランダムな1人を破壊。
    // 行動できるかは場に出たときだけ判定する（ユーザー裁定）：そのときレンスがいれば、場にいる間ずっと行動でき、早食いを持つ。
    y_74: {
        keywords: ['immobile'],
        onEnter: ctx => step(ctx, 'reveal'),
        onDestroyed: ctx => step(ctx, 'death'),
        effect(ctx, t) {
            if (t.step === 'death') {
                if (ctx.foe.field.length) ctx.destroy(ctx.foe.field[ctx.random(ctx.foe.field.length)]);
                return;
            }
            const lens = ctx.me.hand.filter(uid => !ctx.s.cards[uid].revealed && ctx.defOf(uid).name === 'レンス');
            if (!t.target && lens.length) return ctx.ask('手札の【レンス】を公開しますか？', [{ id: 'no', label: '公開しない' }, ...lens.map(id => ({ id, label: 'レンスを公開する' }))], t);
            if (t.target && t.target !== 'no') ctx.reveal(t.target);
            if (!lensWith(ctx) || !ctx.me.field.includes(ctx.uid) || ctx.card.silenced) return;
            ctx.touch(ctx.uid);
            ctx.card.keywords = ctx.card.keywords.filter(keyword => keyword !== 'immobile');
            ctx.addKeyword(ctx.uid, 'fast');
        },
        cpu: { choose: (_ctx, _t, options) => options.find(id => id !== 'no') },
    },
    // y_75 おうか: 猫まんじゅうともちだを1枚ずつ手札に加える。
    y_75: { onPlay(ctx) { ctx.queue('addHand', { cardId: 'token_cat' }); ctx.queue('addHand', { cardId: 'token_mochida' }); } },
    // y_76 うぃまる: 防衛。場にいる間、自分のお菓子ポイントが回復するたびに+1/+1。
    y_76: { keywords: ['guard'], onHealed(ctx, zone) { if (zone === 'field') ctx.buff(ctx.uid, 1, 1); } },
    // y_77 ちょり: 相手幼女1人を次の相手ターン終了時まで行動不能。お昼寝場所の幼女4人を除外したなら、代わりにその幼女を除外。
    // 順番（ユーザー裁定）：相手の幼女を選ぶ → 4人除外するか聞く → 除外する4人を選ぶ → おにごっこのダイス。
    y_77: {
        onPlay(ctx) { if (selectable(ctx.s, ctx.side, ctx.foe.field).length) step(ctx, 'target'); },
        effect(ctx, t) {
            if (t.step === 'target') {
                if (!t.target) return ctx.pick('行動不能にする相手の幼女を選んでください', selectable(ctx.s, ctx.side, ctx.foe.field), t);
                if (exilableNap(ctx).length >= 4) return step(ctx, 'mode', { subject: t.target });
                return finishChori(ctx, t.target, false);
            }
            if (t.step === 'mode') {
                if (!t.target) return ctx.ask('お昼寝場所の幼女を4人除外して、行動不能の代わりにその幼女を除外しますか？', [{ id: 'no', label: '行動不能にする' }, { id: 'yes', label: '4人除外して、その幼女を除外' }], t);
                if (t.target === 'yes') return step(ctx, 'pay', { subject: t.subject, count: 4, amount: 0 });
                return finishChori(ctx, t.subject!, false);
            }
            if (t.target) { ctx.exile(t.target); t = { ...t, target: undefined, count: t.count! - 1, amount: (t.amount ?? 0) + 1 }; }
            const left = exilableNap(ctx);
            if (t.count! > 0 && left.length > t.count!) return ctx.pick(`除外するお昼寝場所の幼女を選んでください（あと${t.count}人）`, left, t);
            if (t.count! > 0) for (const uid of left.slice(0, t.count)) { ctx.exile(uid); t = { ...t, amount: (t.amount ?? 0) + 1 }; }
            finishChori(ctx, t.subject!, t.amount! >= 4);
        },
        cpu: {
            choose: (ctx, t, options) => t.step === 'mode' ? 'yes'
                : t.step === 'target' ? [...options].sort((a, b) => attackOf(ctx.s.cards[b], ctx.catalog) - attackOf(ctx.s.cards[a], ctx.catalog))[0]
                : cheapest(ctx, options),
        },
    },
    // y_78 えーりん: 突撃。追加で4PP払ったなら、早食いと「攻撃終了時、メロンの幼女4人を除外したなら+1/+1し再行動」を得る。
    y_78: {
        keywords: ['charge'],
        onPlay(ctx) { if (ctx.me.pp >= 4) step(ctx, 'pay'); },
        onAttackEnd(ctx) { if (ctx.card.keywords.includes('encore')) step(ctx, 'encore'); },
        effect(ctx, t) {
            if (!ctx.me.field.includes(ctx.uid)) return;
            if (t.step === 'pay') {
                if (ctx.me.pp < 4) return;
                if (!t.target) return ctx.ask('追加で4PP支払って、早食いと再行動の効果を得ますか？', [{ id: 'no', label: '支払わない' }, { id: 'yes', label: '4PP支払う' }], t);
                if (t.target === 'yes') { ctx.me.pp -= 4; ctx.addKeyword(ctx.uid, 'fast'); ctx.addKeyword(ctx.uid, 'encore'); }
            } else if (t.step === 'encore') {
                if (exilableNap(ctx, 'melon').length < 4) return;
                if (!t.target) return ctx.ask('お昼寝場所のメロンタイプの幼女4人を除外して、+1/+1し再行動しますか？', [{ id: 'no', label: '除外しない' }, { id: 'yes', label: '4人除外する' }], t);
                if (t.target === 'yes') step(ctx, 'exileMelon', { count: 4 });
            } else {
                if (t.target) { ctx.exile(t.target); t = { ...t, target: undefined, count: t.count! - 1 }; }
                const left = exilableNap(ctx, 'melon');
                if (t.count! > 0 && left.length > t.count!) return ctx.pick(`除外するメロンタイプの幼女を選んでください（あと${t.count}人）`, left, t);
                for (const uid of t.count! > 0 ? left : []) ctx.exile(uid);
                ctx.buff(ctx.uid, 1, 1);
                ctx.card.exhausted = false;
            }
        },
        cpu: { choose: (ctx, t, options) => t.step === 'pay' || t.step === 'encore' ? 'yes' : cheapest(ctx, options) },
    },
    // y_79 いろは: 自分のお菓子ポイントを7減らし、その後4回復する（1つの処理）。破壊されたとき3回復。
    y_79: {
        onPlay: ctx => step(ctx, 'swing'),
        onDestroyed: ctx => ctx.queue('heal', { amount: 3 }),
        // 7減らした時点で0なら負ける（7以下で使うと負け。ユーザー裁定）。
        effect(ctx) {
            ctx.losePoints(ctx.side, 7, 'reduce');
            if (ctx.me.points > 0) ctx.heal(4);
        },
    },
    // y_80 キラチャン: 自分の手札1枚を除外。デッキからカードを1枚選び、お昼寝場所に捨てる。
    y_80: {
        onPlay: ctx => step(ctx, 'exileHand'),
        effect(ctx, t) {
            if (t.step === 'exileHand') {
                if (!t.target && ctx.me.hand.length) return ctx.pick('除外する手札を選んでください', ctx.me.hand, t);
                if (t.target) ctx.exile(t.target);
                step(ctx, 'mill');
                return;
            }
            const cards = [...ctx.me.yojo, ...ctx.me.sweet];
            if (!t.target) return ctx.pick('お昼寝場所に捨てるデッキのカードを選んでください', cards, t);
            const kind = ctx.me.yojo.includes(t.target) ? 'yojo' : 'sweet';
            ctx.me[kind] = ctx.me[kind].filter(uid => uid !== t.target);
            ctx.me.nap.push(t.target);
            // 選んだあとはデッキをシャッフルする（ユーザー裁定）。
            ctx.shuffleDeck(kind);
        },
        cpu: { choose: (ctx, t, options) => t.step === 'exileHand' ? cheapest(ctx, options) : [...options].sort((a, b) => ctx.defOf(b).cost - ctx.defOf(a).cost)[0] },
    },
    // y_81 ここあ: 手札の幼女カード（トークン以外）1枚を幼女デッキに戻してシャッフルし、1枚引く。その後、猫まんじゅうを手札に加える。
    y_81: {
        onPlay: ctx => step(ctx, 'return'),
        effect(ctx, t) {
            const units = ctx.me.hand.filter(uid => ctx.defOf(uid).type === 'yojo' && !isToken(ctx.s.cards[uid].cardId));
            if (!t.target && units.length) return ctx.pick('幼女デッキに戻す手札の幼女を選んでください', units, t);
            if (t.target) ctx.toDeck(t.target);
            ctx.queue('draw');
            ctx.queue('addHand', { cardId: 'token_cat' });
        },
        cpu: { choose: (ctx, _t, options) => cheapest(ctx, options) },
    },
    // y_82 なかよし: お昼寝場所の猫まんじゅうをすべて除外し、その枚数だけ猫まんじゅうを手札に加える。
    y_82: {
        onPlay: ctx => step(ctx, 'cats'),
        effect(ctx) {
            const cats = ctx.me.nap.filter(uid => isCat(ctx, uid));
            for (const uid of cats) ctx.exile(uid);
            for (let i = 0; i < cats.length; i++) ctx.me.hand.push(ctx.spawn('token_cat'));
        },
    },
    // y_83 いのむー: もちだを公開状態で2枚手札に加える。場を離れたもちだが10体以上なら、手札のもちだすべて+3/+3・早食い。破壊されたとき幼女デッキに戻る。
    y_83: {
        onPlay: ctx => step(ctx, 'mochida'),
        onDestroyed: ctx => ctx.toDeck(ctx.uid),
        effect(ctx) {
            mochidaToHand(ctx, 2);
            if ((ctx.me.mochidaLeft ?? 0) < 10) return;
            for (const uid of ctx.me.hand.filter(uid => ctx.s.cards[uid].cardId === 'token_mochida')) {
                ctx.buff(uid, 3, 3);
                ctx.addKeyword(uid, 'fast');
            }
        },
    },
    // y_84 まこぽに: もちだを公開状態で2枚（場を離れたもちだが5体以上なら4枚）手札に加える。破壊されたとき幼女デッキに戻る。
    y_84: {
        onPlay: ctx => step(ctx, 'mochida'),
        onDestroyed: ctx => ctx.toDeck(ctx.uid),
        effect: ctx => mochidaToHand(ctx, (ctx.me.mochidaLeft ?? 0) >= 5 ? 4 : 2),
    },
    // y_85 ビデカメ: 幼女デッキを公開してシャッフル。重複がなければ、このゲーム中、自分の場に出た幼女すべて+1/+1（この幼女を含む。重複しない）。
    y_85: {
        onPlay(ctx) {
            const ids = ctx.me.yojo.map(uid => ctx.s.cards[uid].cardId);
            ctx.note(`幼女デッキを公開：${ids.map(id => ctx.catalog[id].name).join('、') || 'なし'}`);
            ctx.shuffleDeck('yojo');
            if (new Set(ids).size !== ids.length || ctx.me.entryBuff) return;
            ctx.me.entryBuff = 1;
            ctx.buff(ctx.uid, 1, 1);
        },
    },
    // y_86 しゅみあ: 手札を1枚捨てて1枚引く、を2回。このゲーム中に手札から捨てた幼女が5人以上なら、相手のランダムな1人に3ダメージ。
    y_86: {
        onPlay(ctx) {
            for (let i = 0; i < 2; i++) { ctx.queue('discard'); ctx.queue('draw'); }
            step(ctx, 'check');
        },
        effect(ctx) { if ((ctx.me.discardedYojo ?? 0) >= 5) ctx.queue('randomDamage', { amount: 3 }); },
    },
    // y_87 ぽめちゃん: 破壊されたとき、相手のお菓子を1（攻撃力5以上なら5）減らす。
    y_87: { onDestroyed: ctx => ctx.queue('reduce', { amount: attackOf(ctx.card, ctx.catalog) >= 5 ? 5 : 1 }) },
    // y_88 かがり: 色おに（メロン）。かがり以外のメロンタイプの幼女をランダムに公開状態で手札に加える。
    y_88: { keywords: ['colorMelon'], onPlay: ctx => randomSearch(ctx, uid => ctx.fruits(uid).includes('melon') && ctx.s.cards[uid].cardId !== 'y_88') },
    // y_89 りんまる。: お昼寝場所に猫まんじゅうを1体追加し、お昼寝場所の猫まんじゅうすべてにメロンタイプを付与する。
    y_89: {
        onPlay: ctx => step(ctx, 'cat'),
        effect(ctx) {
            ctx.me.nap.push(ctx.spawn('token_cat'));
            for (const uid of ctx.me.nap.filter(uid => isCat(ctx, uid))) ctx.addFruit(uid, 'melon');
        },
    },
    // y_90 幸野粉白: 挑発。体力4以上の幼女をランダムに公開状態で手札に加える。
    y_90: { keywords: ['taunt'], onPlay: ctx => randomSearch(ctx, uid => ctx.defOf(uid).hp >= 4) },
    // y_91 あみの: 攻撃時、相手のお昼寝場所の幼女2人を除外。手札誘発（攻撃の無効化）は effects/expandedOps.ts の attackResponses。
    y_91: {
        onAttack: ctx => step(ctx, 'exileNap', { count: 2 }),
        effect(ctx, t) {
            if (t.target) { ctx.exile(t.target, ctx.foeSide); t = { ...t, target: undefined, count: t.count! - 1 }; }
            const units = ctx.foe.nap.filter(uid => ctx.defOf(uid).type === 'yojo' && !(ctx.s.cards[uid].cardId === 'y_146' && !ctx.s.cards[uid].silenced));
            if (t.count! <= 0) return;
            if (units.length > t.count!) return ctx.pick(`除外する相手のお昼寝場所の幼女を選んでください（あと${t.count}人）`, units, t);
            for (const uid of units) ctx.exile(uid, ctx.foeSide);
        },
        cpu: { choose: (ctx, _t, options) => [...options].sort((a, b) => ctx.defOf(b).cost - ctx.defOf(a).cost)[0] },
    },
    // y_92 ほーずき: 突撃。攻撃力4以上の幼女をランダムに公開状態で手札に加える。
    y_92: { keywords: ['charge'], onPlay: ctx => randomSearch(ctx, uid => ctx.defOf(uid).attack >= 4) },
    // y_93 ぷらむ: 防衛。自分の場の他の幼女をすべて手札に戻し、その人数だけ相手のランダムな幼女を相手の手札に戻す。
    y_93: {
        keywords: ['guard'],
        onPlay: ctx => step(ctx, 'bounce'),
        effect(ctx) {
            const mine = others(ctx);
            for (const uid of mine) ctx.bounce(uid);
            const pool = [...ctx.foe.field];
            for (let i = mine.filter(uid => ctx.me.hand.includes(uid)).length; i > 0 && pool.length; i--) ctx.bounce(pool.splice(ctx.random(pool.length), 1)[0]);
        },
    },
    // y_94 オフティ二: 防衛。おにごっこ（1d6≧6）。1枚引く。破壊されたとき、相手の攻撃力最大の幼女（すべて）を3ターンの間行動不能。
    y_94: {
        keywords: ['guard', 'evade'], evasion: 6,
        onPlay: ctx => ctx.queue('draw'),
        onDestroyed: ctx => step(ctx, 'freeze'),
        effect(ctx) {
            if (!ctx.foe.field.length) return;
            const top = Math.max(...ctx.foe.field.map(uid => attackOf(ctx.s.cards[uid], ctx.catalog)));
            // その幼女の持ち主がこれから3回ターンを終えるまで。持ち主のターン中なら、そのターンの終わりも数える（ユーザー裁定）。
            const until = ctx.s.turn + (ctx.s.active === ctx.foeSide ? 4 : 5);
            for (const uid of ctx.foe.field.filter(uid => attackOf(ctx.s.cards[uid], ctx.catalog) === top)) ctx.immobilize(uid, until);
        },
    },
    // y_95 氷花: 幼女デッキの上3枚を見て1枚をお昼寝場所に捨て、残り2枚を好きな順で上に戻す。その後2枚引く。
    y_95: {
        onPlay: ctx => step(ctx, 'look', { candidates: ctx.me.yojo.slice(0, 3) }),
        effect(ctx, t) {
            const seen = (t.candidates ?? []).filter(uid => ctx.me.yojo.includes(uid));
            if (t.step === 'look' && seen.length) {
                if (!t.target) return ctx.pick('お昼寝場所に捨てるカードを選んでください（幼女デッキの上3枚）', seen, t);
                ctx.me.yojo = ctx.me.yojo.filter(uid => uid !== t.target);
                ctx.me.nap.push(t.target);
                const rest = seen.filter(uid => uid !== t.target);
                if (rest.length === 2) return step(ctx, 'order', { candidates: rest });
            } else if (t.step === 'order' && seen.length === 2) {
                if (!t.target) return ctx.pick('幼女デッキの一番上に置くカードを選んでください', seen, t);
                const second = seen.find(uid => uid !== t.target)!;
                ctx.me.yojo = [t.target, second, ...ctx.me.yojo.filter(uid => !seen.includes(uid))];
            }
            ctx.queue('draw', { count: 2 });
        },
        cpu: { choose: (ctx, t, options) => [...options].sort((a, b) => t.step === 'look' ? ctx.defOf(a).cost - ctx.defOf(b).cost : ctx.defOf(b).cost - ctx.defOf(a).cost)[0] },
    },
    // y_96 ももか: 場かお昼寝場所にいれば、自分のお菓子ポイントが回復するたびに相手のお菓子を1減らす（重複しない）。
    y_96: {
        onHealed(ctx) {
            const first = [...ctx.me.field, ...ctx.me.nap].find(uid => ctx.s.cards[uid].cardId === 'y_96' && !ctx.s.cards[uid].silenced);
            if (first === ctx.uid) ctx.queue('reduce', { amount: 1 });
        },
    },
    // y_97 オズちゃんぽん: おにごっこ（1d6≧5）。相手は手札を任意の枚数公開する。公開されていない相手の手札1枚につきPPを1回復。
    y_97: {
        keywords: ['evade'], evasion: 5,
        // The opponent chooses what to reveal from their own hand.
        onPlay: ctx => step(ctx, 'reveal', { actor: ctx.foeSide }),
        effect(ctx, t) {
            revealStep(ctx, t, () => true, () => {
                const hidden = ctx.me.hand.filter(uid => !ctx.s.cards[uid].revealed).length;
                if (hidden) ctx.queue('pp', { actor: ctx.foeSide, amount: hidden });
            });
        },
        // Revealing everything leaves the player of this card no PP.
        cpu: { choose: (_ctx, t, options) => options.find(id => id !== 'done' && !(t.ids ?? []).includes(id)) ?? 'done' },
    },
    // y_98 ふろんとさん: 突撃。攻撃する前に攻撃力と体力を入れ替える。1ターンに2回行動できる。
    y_98: { keywords: ['charge'], actionsPerTurn: 2, onAttack: ctx => ctx.swapStats(ctx.uid) },
    // y_99 りくす: 突撃。破壊されたとき、自分の場のランダムな幼女2人を+2/+2し、お仕置き棒を公開状態で手札に加える。
    y_99: {
        keywords: ['charge'],
        onDestroyed: ctx => step(ctx, 'death'),
        effect(ctx) {
            const pool = [...ctx.me.field];
            for (let i = 0; i < 2 && pool.length; i++) ctx.buff(pool.splice(ctx.random(pool.length), 1)[0], 2, 2);
            const stick = ctx.spawn('token_stick');
            ctx.me.hand.push(stick);
            ctx.reveal(stick);
        },
    },
    // y_100 レンス: 突撃。色おに（イチゴ）。場に出たとき自分の場にゼロオレンジがいれば、早食いを得て、次の相手ターン終了時まで相手の幼女すべてをイチゴタイプにする。
    y_100: {
        keywords: ['charge', 'colorStrawberry'],
        onEnter(ctx) {
            if (!ctx.me.field.some(uid => uid !== ctx.uid && named(ctx, uid, 'ゼロオレ'))) return;
            ctx.addKeyword(ctx.uid, 'fast');
            const until = ctx.s.turn + (ctx.s.active === ctx.side ? 1 : 2);
            for (const uid of ctx.foe.field) ctx.addFruit(uid, 'strawberry', until);
        },
    },
    // y_101 ほとり丸: 早食い。手札の猫まんじゅうを任意の数だけ捨て、その数Xだけ+X/+X、相手のお菓子をX個奪う。
    y_101: {
        keywords: ['fast'],
        onPlay: ctx => step(ctx, 'discard', { ids: [] }),
        effect(ctx, t) {
            // 選び終えてから、X体をまとめて捨てる（神隠し ようじょ贄は1回で2X個。ユーザー裁定）。
            if (t.target && t.target !== 'done') t = { ...t, target: undefined, ids: [...(t.ids ?? []), t.target] };
            const chosen = t.ids ?? [], cats = ctx.me.hand.filter(uid => isCat(ctx, uid) && !chosen.includes(uid));
            if (t.target !== 'done' && cats.length) return ctx.ask('捨てる猫まんじゅうを選んでください（任意）', [{ id: 'done', label: `捨て終える（${chosen.length}体）` }, ...cats.map(id => ({ id, label: '猫まんじゅうを捨てる' }))], t);
            const x = chosen.length;
            if (!x) return;
            ctx.discard(chosen);
            ctx.buff(ctx.uid, x, x);
            ctx.queue('steal', { amount: x });
        },
        cpu: { choose: (_ctx, _t, options) => options.find(id => id !== 'done') ?? 'done' },
    },
    // y_102 しゅれい: ①相手の幼女すべて-2/-2 ②相手の体力2以下の幼女すべてを除外、から選ぶ。
    y_102: {
        onPlay: ctx => step(ctx, 'mode'),
        effect(ctx, t) {
            if (!t.target) return ctx.ask('しゅれいの効果を選んでください', [{ id: 'weaken', label: '相手の幼女すべてを-2/-2' }, { id: 'exile', label: '相手の体力2以下の幼女すべてを除外' }], t);
            if (t.target === 'weaken') ctx.queue('allBuff', { scope: 'enemy', amount: -2, hp: -2 });
            else for (const uid of ctx.foe.field.filter(uid => hpOf(ctx.s.cards[uid], ctx.catalog) <= 2)) ctx.exile(uid);
        },
        cpu: { choose: ctx => ctx.foe.field.some(uid => ctx.s.cards[uid].cardId === 'y_106') ? 'exile' : 'weaken' },
    },
    // y_103 ちむどんどん: 双方、トークン以外の手札をすべて元のデッキに戻してシャッフルし、その後5枚ずつ引く。
    y_103: {
        onPlay: ctx => step(ctx, 'reset'),
        effect(ctx) {
            for (const p of [ctx.me, ctx.foe]) for (const uid of p.hand.filter(uid => !isToken(ctx.s.cards[uid].cardId))) ctx.toDeck(uid);
            ctx.queue('draw', { count: 5 });
            ctx.queue('draw', { count: 5, actor: ctx.foeSide });
        },
    },
    // y_104 ストラ: 早食い。場に出たとき、お昼寝場所の幼女が5人以上なら貫通。攻撃時、10人以上なら+3/+3、15人以上ならさらにPPを3回復。
    y_104: {
        keywords: ['fast'],
        onEnter(ctx) { if (napUnits(ctx).length >= 5) ctx.addKeyword(ctx.uid, 'pierce'); },
        onAttack(ctx) {
            const n = napUnits(ctx).length;
            if (n >= 10) ctx.buff(ctx.uid, 3, 3);
            if (n >= 15) ctx.gainPp(3);
        },
    },
    // y_105 しゅお: 突撃。攻撃・被攻撃でダメージを受けて破壊されなかったら、体力を全回復し、回復した値の半分だけPPを回復。
    y_105: {
        keywords: ['charge'],
        onCombatDamage(ctx) {
            const healed = ctx.card.damage;
            ctx.card.damage = 0;
            ctx.gainPp(Math.floor(healed / 2));
        },
    },
    // y_106 もなか: 効果で破壊されない。1度に受けるダメージは3まで。手札から出たとき1度だけダメージを0にする。破壊されたら敗北。
    y_106: {
        keywords: ['destroyImmune'], maxDamage: 3,
        onPlay(ctx) { if (ctx.me.field.includes(ctx.uid)) ctx.card.shield = true; },
        onDestroyed(ctx) { ctx.note('もなかが破壊されたため敗北'); ctx.lose(); },
    },
    // y_107 かんらん: Exスキル「神隠し ようじょ贄」（2回）を得る。処理は core/zones.ts の discard と playables/exSkills.ts。
    y_107: { onPlay: ctx => gainEx(ctx, 'kamikakushi', 2) },
    // y_108 よみ: 挑発。色おに（ぶどう）。お昼寝場所のコスト2以下の幼女1人と、コスト4以下の幼女1人を自分の場に出す。
    y_108: {
        keywords: ['taunt', 'colorGrape'],
        onPlay: ctx => step(ctx, 'low', { amount: 2 }),
        effect(ctx, t) {
            const eligible = napUnits(ctx).filter(uid => uid !== ctx.uid && napCost(ctx, uid) <= t.amount!);
            if (!t.target && eligible.length && ctx.me.field.length < 7) return ctx.pick(`場に出すお昼寝場所の幼女（コスト${t.amount}以下）`, eligible, t);
            if (t.target) revive(ctx, t.target);
            if (t.step === 'low') step(ctx, 'high', { amount: 4 });
        },
        cpu: { choose: (ctx, _t, options) => [...options].sort((a, b) => ctx.defOf(b).cost - ctx.defOf(a).cost)[0] },
    },
    // y_109 ぶらんちゃん: 手札誘発。処理は effects/expandedOps.ts の playResponse と commands/play.ts。
    y_109: {},
    // y_110 レンテ: 相手のスキルを1つ奪う（相手の残り回数を1減らし、自分が1回使える）。場に出たとき、ギガプリン1・猫まんじゅう2・もちだ3を出す。
    y_110: {
        onEnter(ctx) {
            ctx.queue('summon', { cardId: 'token_pudding' });
            ctx.queue('summon', { cardId: 'token_cat', count: 2 });
            ctx.queue('summon', { cardId: 'token_mochida', count: 3 });
        },
        onPlay: ctx => step(ctx, 'take'),
        effect(ctx, t) {
            // Only a skill with uses left can lose one. Reaction skills and MP skills cannot be used by the taker.
            const skills = skillsFor(ctx.foe.playable);
            const takeable = skills.flatMap((skill, index) => skill.uses !== undefined && !skill.reaction && !skill.mp && ctx.foe.skills[index] > 0 ? [index] : []);
            if (!takeable.length) return;
            if (!t.target) return ctx.ask('奪う相手のスキルを選んでください', takeable.map(index => ({ id: String(index), label: `${skills[index].name}（${skills[index].cost}PP・残り${ctx.foe.skills[index]}回）` })), t);
            const index = Number(t.target), playable = ctx.foe.playable;
            ctx.foe.skills[index]--;
            const owned = ctx.me.extraSkills?.find(entry => entry.playable === playable && entry.index === index);
            if (owned) owned.uses++;
            else ctx.me.extraSkills = [...(ctx.me.extraSkills ?? []), { playable, index, uses: 1 }];
            ctx.note(`${skills[index].name}を奪いました`);
        },
        cpu: { choose: (ctx, _t, options) => [...options].sort((a, b) => skillsFor(ctx.foe.playable)[Number(b)].cost - skillsFor(ctx.foe.playable)[Number(a)].cost)[0] },
    },
    // y_111 まめろん: 防衛。色おに（メロン）。空腹状態なら効果で破壊されない。攻撃時と被攻撃時、0/+2。
    y_111: {
        keywords: ['guard', 'colorMelon'],
        onPlay(ctx) { if (ctx.me.points <= 5 && ctx.me.field.includes(ctx.uid)) ctx.addKeyword(ctx.uid, 'destroyImmune'); },
        onAttack: ctx => ctx.buff(ctx.uid, 0, 2),
        onDefend: ctx => ctx.buff(ctx.uid, 0, 2),
    },
    // y_112 とここ: 突撃。攻撃時はダメージを受けない。攻撃で相手の幼女を破壊したら、超過ダメージだけ相手のお菓子を減らす。
    y_112: {
        keywords: ['charge'], unharmedAttacking: true,
        onAttackKill(ctx, _target, excess) { if (excess > 0) ctx.queue('reduce', { amount: excess }); },
    },
};
