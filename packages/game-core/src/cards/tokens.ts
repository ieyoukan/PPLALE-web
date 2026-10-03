// 効果で生成されるトークン。
import type { CardScripts } from './types.ts';

export const tokens: CardScripts = {
    // 猫まんじゅう（1コスト 1/1 効果なし）
    token_cat: {},
    // ギガプリン（5コスト 0/7 挑発。防衛。行動不能。）
    token_pudding: { keywords: ['taunt', 'guard', 'immobile'] },
};
