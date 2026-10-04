// 効果で生成されるトークン。各カードの原文は src/data/token.json。
import type { CardScripts } from './types.ts';

export const tokens: CardScripts = {
    // 猫まんじゅう（1コスト 1/1 効果なし）
    token_cat: {},
    // ギガプリン（5コスト 0/7 挑発。防衛。行動不能。）
    token_pudding: { keywords: ['taunt', 'guard', 'immobile'] },
    // もちだ（0コスト 1/1 突撃）と お仕置き棒（2コスト ギミック）は token.json にデータだけある。
    // いちごのカードからは生成されないので、効果は生成元のフルーツを実装するときに書く。
};
