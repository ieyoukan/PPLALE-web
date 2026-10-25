import type { Keyword } from '../model.ts';

/** Enumerable vocabulary; legality is always checked by the combat/effect engine. */
export const keywordDefinitions = {
    charge: { name: '突撃', rule: '登場ターンに相手幼女へ攻撃できる。お菓子への攻撃は許可しない。' },
    fast: { name: '早食い', rule: '登場ターンに幼女・お菓子へ攻撃できる。防衛は無視しない。' },
    guard: { name: '防衛', rule: '貫通のない相手は、隠れていない防衛持ちだけを攻撃先にできる。' },
    taunt: { name: '挑発', rule: '元の選択対象に含まれるとき対象を集中する。お菓子を奪う効果も無効化する。' },
    pierce: { name: '貫通', rule: '防衛による攻撃先の制限を無視する。登場直後の行動許可は別判定。' },
    immobile: { name: '行動不能', rule: '幼女が行動できない。期限付きの行動不能はimmobileUntilでも管理する。' },
    noEat: { name: 'お菓子を食べられない', rule: '幼女によるお菓子への攻撃を禁止する。' },
    effectImmune: { name: '効果耐性', rule: '効果ダメージ・効果破壊などを防ぐ。適用範囲はカード原文と効果処理の裁定に従う。' },
    destroyImmune: { name: '効果破壊耐性', rule: '効果による破壊を防ぐ。通常戦闘の体力判定とは別。' },
    hide: { name: 'かくれんぼ', rule: 'hidingが有効な間は攻撃・選択効果の対象にならない。全体・ランダム効果は別。' },
    evade: { name: 'おにごっこ', rule: '選択対象になったとき1d6がevasion以上なら回避する。全体・ランダム効果は別。' },
    colorOrange: { name: '色おに（オレンジ）', rule: 'オレンジの相手幼女からのダメージ・効果を防ぐ。' },
    colorStrawberry: { name: '色おに（イチゴ）', rule: 'イチゴの相手幼女からのダメージ・効果を防ぐ。' },
    colorGrape: { name: '色おに（ぶどう）', rule: 'ぶどうの相手幼女からのダメージ・効果を防ぐ。' },
    colorMelon: { name: '色おに（メロン）', rule: 'メロンの相手幼女からのダメージ・効果を防ぐ。' },
    exileAtEnd: { name: '終了時除外', rule: '自分のターン終了時にこの幼女を除外する。' },
    encore: { name: '再行動の支払い', rule: '攻撃終了時にメロンの幼女4人をお昼寝場所から除外すると+1/+1して再行動する。' },
} satisfies Record<Keyword, { name: string; rule: string }>;
