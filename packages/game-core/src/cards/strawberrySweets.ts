// いちご（strawberry）のお菓子カード s_0〜s_27。原文は src/data/sweet.json。
// お菓子の効果は `ctx.multiplier`（おいしくなる呪文）を持った状態で queue される。
import type { CardContext } from '../effects/context.ts';
import type { Keyword } from '../model.ts';
import type { CardScript, CardScripts, OpTable } from './types.ts';
import { selectable } from '../effects/targets.ts';

const ofType = (ctx: CardContext, sweetType: string) => (cardId: string) => ctx.catalog[cardId]?.sweetType === sweetType;
/** このカードを含めて、このゲーム中にプレイした `sweetType` の種類数。 */
const kindsIncludingThis = (ctx: CardContext, sweetType: string) =>
    new Set([...ctx.me.played, ctx.card.cardId].filter(ofType(ctx, sweetType))).size;

const needsEnemyUnit = { worthPlaying: (ctx: CardContext) => ctx.foe.field.length > 0 };
/** 「相手の幼女1人に〜」は対象の選択が必要。相手の場に幼女がいなければ使えない。 */
const enemyUnitOnField = (ctx: CardContext) => selectable(ctx.s, ctx.side, ctx.foe.field).length > 0;
/** 「自分の場にいる幼女1人を〜」も同じく、自分の場に幼女がいなければ使えない。 */
const ownUnitOnField = (ctx: CardContext) => ctx.me.field.length > 0;
const needsOwnUnit = { worthPlaying: (ctx: CardContext) => ctx.me.field.length > 0 };

/** s_0〜s_5 動物さんソーダ: プレイした種類数 X に応じた効果。 */
const animalSoda: CardScript = {
    // X=2 は相手の幼女1人を選ぶので、対象がいなければ使えない。
    canPlay: ctx => kindsIncludingThis(ctx, 'animal_soda') !== 2 || enemyUnitOnField(ctx),
    onPlay(ctx) {
        switch (kindsIncludingThis(ctx, 'animal_soda')) {
            case 1: return ctx.queue('draw');
            case 2: return ctx.queue('damage', { scope: 'enemy', amount: 2 });
            case 3: return ctx.queue('steal', { amount: 2 });
            case 4: return ctx.queue('allDamage', { scope: 'enemy', amount: 3 });
            case 5: return ctx.queue('draw', { count: 3 });
            case 6: return ctx.queue('steal', { amount: 5 });
        }
    },
};

/** フロート: このゲームで初めてのフロートなら、手札を1枚除外してデッキからフロートを手札に加えてもよい。 */
const floatOps: OpTable = {
    float: {
        run(fx, t) {
            if (!t.target) {
                if (fx.me.hand.length) fx.ask('手札を1枚除外してフロートを探しますか？', [{ id: 'skip', label: 'しない' }, ...fx.me.hand.map(id => ({ id, label: fx.defOf(id).name }))], t);
                return;
            }
            if (t.target === 'skip') return;
            fx.exile(t.target);
            fx.next({ ...t, op: 'floatSearch', target: undefined });
        },
        cpu: () => 'skip',
    },
    floatSearch: {
        run(fx, t) {
            if (!t.target) {
                fx.pick('手札に加えるフロートを選んでください', fx.me.sweet.filter(id => fx.defOf(id).sweetType === 'float'), t);
                return;
            }
            fx.me.sweet = fx.me.sweet.filter(id => id !== t.target);
            fx.me.hand.push(t.target);
        },
    },
};
const float = (onPlay: (ctx: CardContext) => void, canPlay: (ctx: CardContext) => boolean): CardScript => ({
    canPlay,
    onPlay(ctx) {
        onPlay(ctx);
        if (!ctx.me.played.some(ofType(ctx, 'float'))) ctx.queue('float');
    },
    ops: floatOps,
    cpu: needsEnemyUnit,
});

/** ドーナツ: 手札のドーナツを1枚捨てたなら、自分の幼女1人に `keyword`。 */
const doughnutOps: OpTable = {
    doughnut: {
        run(fx, t) {
            if (!t.target) {
                fx.pick('捨てるドーナツを選んでください', fx.me.hand.filter(id => fx.defOf(id).sweetType === 'doughnut'), t);
                return;
            }
            fx.discard(t.target);
            fx.next({ ...t, op: 'keyword', scope: 'friendly', target: undefined });
        },
    },
};
const doughnut = (keyword: Keyword): CardScript => ({ canPlay: ownUnitOnField, onPlay: ctx => ctx.queue('doughnut', { keyword }), ops: doughnutOps, cpu: needsOwnUnit });

/** ケーキ: 自分の幼女1人を +1/+1。このカードを含めてケーキを3種類プレイしていたなら追加効果。 */
const cake = (bonus: 'draw' | 'big' | 'all'): CardScript => ({
    // 3種類目のくまちょこけーきは全体になり、対象を選ばない。
    canPlay: ctx => bonus === 'all' && kindsIncludingThis(ctx, 'cake') >= 3 || ownUnitOnField(ctx),
    onPlay(ctx) {
        const full = kindsIncludingThis(ctx, 'cake') >= 3;
        if (full && bonus === 'all') ctx.queue('allBuff', { scope: 'friendly', amount: 1, hp: 1 });
        else if (full && bonus === 'big') ctx.queue('buff', { scope: 'friendly', amount: 3, hp: 3 });
        else ctx.queue('buff', { scope: 'friendly', amount: 1, hp: 1 });
        if (full && bonus === 'draw') ctx.queue('draw', { count: 2 });
    },
    cpu: needsOwnUnit,
});

export const strawberrySweets: CardScripts = {
    s_0: animalSoda, s_1: animalSoda, s_2: animalSoda, s_3: animalSoda, s_4: animalSoda, s_5: animalSoda,
    // s_6 猫カフェオレ: 相手の幼女1体に3ダメージ。既に犬カフェオレをプレイしていたなら1枚引く。
    s_6: {
        canPlay: enemyUnitOnField,
        onPlay(ctx) {
            ctx.queue('damage', { scope: 'enemy', amount: 3 });
            if (ctx.playedBefore('s_7')) ctx.queue('draw');
        },
        cpu: needsEnemyUnit,
    },
    // s_7 犬カフェオレ: 相手の幼女1体に3ダメージ。既に猫カフェオレをプレイしていたならお菓子を1個奪う。
    s_7: {
        canPlay: enemyUnitOnField,
        onPlay(ctx) {
            ctx.queue('damage', { scope: 'enemy', amount: 3 });
            if (ctx.playedBefore('s_6')) ctx.queue('steal', { amount: 1 });
        },
        cpu: needsEnemyUnit,
    },
    // s_8 ラテアート: 相手の幼女すべてに3ダメージ。猫と犬の両方をプレイしていたなら1枚引き、お菓子を2個奪う。
    s_8: {
        onPlay(ctx) {
            ctx.queue('allDamage', { scope: 'enemy', amount: 3 });
            if (ctx.playedBefore('s_6') && ctx.playedBefore('s_7')) {
                ctx.queue('draw');
                ctx.queue('steal', { amount: 2 });
            }
        },
        cpu: needsEnemyUnit,
    },
    // s_9 コーラフロート: 相手の幼女1人に2ダメージ。既にメロンソーダフロートをプレイしていたなら6ダメージ。
    s_9: float(ctx => ctx.queue('damage', { scope: 'enemy', amount: ctx.playedBefore('s_10') ? 6 : 2 }), enemyUnitOnField),
    // s_10 メロンソーダフロート: 相手の幼女1人に2ダメージ。既にコーラフロートをプレイしていたなら相手全体に。
    // 全体になった後は対象を選ばないので、相手の場に幼女がいなくても使える。
    s_10: float(ctx => ctx.queue(ctx.playedBefore('s_9') ? 'allDamage' : 'damage', { scope: 'enemy', amount: 2 }),
        ctx => ctx.playedBefore('s_9') || enemyUnitOnField(ctx)),
    s_11: doughnut('pierce'), // ジャンガリアンドーナツ
    s_12: doughnut('taunt'), // ゴールデンドーナツ
    s_13: doughnut('guard'), // ハリネズミドーナツ
    s_14: doughnut('fast'), // ラビットドーナツ
    s_15: cake('draw'), // にゃんこけーき: 3種類なら2枚引く
    s_16: cake('big'), // うさぎいちごけーき: 3種類なら +3/+3
    s_17: cake('all'), // くまちょこけーき: 3種類ならすべての幼女
    // s_18 いちごパフェ: 2枚引く。幼女デッキから引いた枚数だけ相手のお菓子を減らし、お菓子デッキからの枚数だけ回復。
    s_18: {
        onPlay: ctx => ctx.queue('draw', { count: 2 }),
        onDrawn(ctx, { kind, uid }) {
            if (!uid) return;
            if (kind === 'yojo') ctx.losePoints(ctx.foeSide, 1, 'reduce');
            else ctx.heal(1);
        },
    },
    // s_19 ふわふわパンケーキ: お菓子を3回復。食べる／奪う効果を1度だけ無効化（重複しない）。
    s_19: {
        onPlay(ctx) {
            ctx.queue('heal', { amount: 3 });
            ctx.me.shield = true;
        },
        cpu: { worthPlaying: ctx => ctx.me.points < ctx.me.maxPoints || !ctx.me.shield },
    },
    // s_20 でっかいシュークリーム: 自分の幼女1人を +4/+4 し、防衛を付与。
    s_20: { canPlay: ownUnitOnField, onPlay: ctx => ctx.queue('buff', { scope: 'friendly', amount: 4, hp: 4, keyword: 'guard' }), cpu: needsOwnUnit },
    // s_21 ぷるぷるギガプリン: ギガプリンを1体出す。お菓子を2回復。
    s_21: {
        onPlay(ctx) {
            ctx.queue('summon', { cardId: 'token_pudding', count: ctx.multiplier });
            ctx.queue('heal', { amount: 2 });
        },
    },
    // s_22 ぜいたくプリンアラモード: 相手のお菓子を7奪う。
    s_22: { onPlay: ctx => ctx.queue('steal', { amount: 7 }) },
    // s_23 くっつくポッキー: 相手の幼女1人と自分の幼女1人を選ぶ。一方が破壊されたらもう一方も破壊。
    s_23: {
        canPlay: ctx => ownUnitOnField(ctx) && enemyUnitOnField(ctx),
        onPlay: ctx => ctx.queue('pocky', { scope: 'friendly' }),
        ops: {
            pocky: {
                target: 'unit',
                // The friendly pick is done; now pick the enemy with a fresh candidate list.
                run: (fx, t) => fx.next({ ...t, op: 'pockyEnemy', scope: 'enemy', target: undefined, candidates: undefined, ids: [t.target!] }),
            },
            pockyEnemy: {
                target: 'unit',
                run(fx, t) {
                    const [mine] = t.ids!, theirs = t.target!;
                    if (fx.protected(theirs)) return;
                    fx.s.cards[theirs].links.push(mine);
                    fx.s.cards[mine].links.push(theirs);
                },
            },
        },
        cpu: { worthPlaying: ctx => ctx.me.field.length > 0 && ctx.foe.field.length > 0 },
    },
    // s_24 ぷぷりえーる（裏メニュー）: 自分の幼女すべて +1/+1 と早食い。
    // 手札で公開できる。公開中は手札から幼女を出すたびにコスト-1。
    s_24: {
        revealable: true,
        onPlay: ctx => ctx.queue('allBuff', { scope: 'friendly', amount: 1, hp: 1, keyword: 'fast' }),
        onOwnerPlayed(ctx, played, zone) {
            if (zone === 'hand' && ctx.card.revealed && ctx.defOf(played).type === 'yojo') ctx.card.costDelta--;
        },
        cpu: needsOwnUnit,
    },
    // s_25 おいしくなる呪文（裏メニュー）: 次の（動物さんソーダ以外の）お菓子の効果を2倍。重ねると加算（2回で3倍）。
    s_25: { onPlay: ctx => { ctx.me.sweetBoost++; } },
    // s_26 おうたあそび（裏メニュー）: 1枚引く。手札のお菓子1枚を公開し、コスト-1。
    s_26: {
        onPlay(ctx) {
            ctx.queue('draw');
            ctx.queue('handCost', { amount: -1 });
        },
    },
    // s_27 すいーつあーん（裏メニュー）: 手札のお菓子1枚を公開して消滅させ、同名カードを相手の手札に公開状態で加える。PPを2回復。
    // 渡すお菓子がなくてもPPは回復する（対象のない処理だけ不発）。
    s_27: {
        onPlay(ctx) {
            ctx.queue('gift');
            ctx.queue('pp', { amount: 2 });
        },
        ops: {
            gift: {
                run(fx, t) {
                    if (!t.target) {
                        fx.pick('相手へ渡すお菓子を選んでください', fx.me.hand.filter(id => fx.isRealSweet(id)), t);
                        return;
                    }
                    fx.me.hand = fx.me.hand.filter(id => id !== t.target);
                    fx.me.exile.push(t.target);
                    const copy = fx.spawn(fx.s.cards[t.target].cardId);
                    fx.foe.hand.push(copy);
                    fx.s.cards[copy].revealed = true;
                },
            },
        },
    },
};
