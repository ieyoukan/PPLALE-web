// 効果で生成されるトークン。各カードの原文は src/data/token.json。
import type { CardScripts } from './types.ts';

export const tokens: CardScripts = {
    // 猫まんじゅう（1コスト 1/1 効果なし）
    token_cat: {},
    // ギガプリン（5コスト 0/7 挑発。防衛。行動不能。）
    token_pudding: { keywords: ['taunt', 'guard', 'immobile'] },
    token_mochida: {
        keywords: ['charge'],
        onPlay(ctx) { for (const uid of ctx.me.hand) if (ctx.s.cards[uid].cardId === 's_24' && ctx.s.cards[uid].revealed) ctx.s.cards[uid].costDelta++; },
    },
    token_stick: { canPlay: ctx => ctx.foe.field.some(uid => ctx.s.cards[uid].ateOn === ctx.s.turn - 1), onPlay(ctx) { ctx.queue('destroy', { candidates: ctx.foe.field.filter(uid => ctx.s.cards[uid].ateOn === ctx.s.turn - 1) }); } },
};
