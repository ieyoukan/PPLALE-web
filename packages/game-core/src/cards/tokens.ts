// 効果で生成されるトークン。各カードの原文は src/data/token.json。
import type { CardContext } from '../effects/context.ts';
import { selectable } from '../effects/targets.ts';
import type { CardScripts } from './types.ts';

/** お仕置き棒: 直前の相手ターンにお菓子を食べた幼女のうち、選べるもの（かくれんぼ中は選べない。挑発がいれば挑発だけ）。 */
const punishable = (ctx: CardContext) => selectable(ctx.s, ctx.side, ctx.foe.field.filter(uid => ctx.s.cards[uid].ateOn === ctx.s.turn - 1));

export const tokens: CardScripts = {
    // 猫まんじゅう（1コスト 1/1 効果なし）
    token_cat: {},
    // ギガプリン（5コスト 0/7 挑発。防衛。行動不能。）
    token_pudding: { keywords: ['taunt', 'guard', 'immobile'] },
    token_mochida: {
        keywords: ['charge'],
        onPlay(ctx) { for (const uid of ctx.me.hand) if (ctx.s.cards[uid].cardId === 's_24' && ctx.s.cards[uid].revealed) ctx.s.cards[uid].costDelta++; },
    },
    // お仕置き棒（2コスト）: 直前の相手ターンにお菓子を食べた幼女を1人破壊する。選べる幼女がいなければ使えない。
    token_stick: { canPlay: ctx => punishable(ctx).length > 0, onPlay(ctx) { ctx.queue('destroy', { candidates: ctx.foe.field.filter(uid => ctx.s.cards[uid].ateOn === ctx.s.turn - 1) }); } },
};
