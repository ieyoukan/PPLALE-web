import { RuleError, other } from '../model.ts';
import type { Catalog, ExSkillId, GameState, Side } from '../model.ts';
import { effects } from '../effects/context.ts';

export const exSkillInfo: Record<ExSkillId, { name: string; cost: number; automatic: boolean; description: string }> = {
    dice: { name: 'クマはサイコロを振らない', cost: 0, automatic: true, description: '1d6を振るとき、出目を指定する。' },
    strawberryHunt: { name: 'イチゴ狩り', cost: 3, automatic: false, description: '次の相手ターンはイチゴタイプの幼女だけプレイ可能。' },
    healing: { name: 'ここあの献身', cost: 0, automatic: true, description: 'お菓子ポイントの回復量を+1。' },
    abyss: { name: 'アビスの深淵', cost: 0, automatic: true, description: '味方幼女が破壊されると相手のお菓子ポイントを1減らす。' },
    dagger: { name: 'ダブルダガー', cost: 0, automatic: true, description: '自分ターンの効果によるPP回復を+2。1ターン2回。' },
    alice: { name: '不思議の国のアリス', cost: 0, automatic: false, description: '味方全員を+3/+3。1ターン1回。' },
    smoke: { name: '魅惑の水煙', cost: 0, automatic: true, description: 'カード効果で引く・サーチするたび、手札に加えた1枚につき自分のお菓子ポイントを1減らす。' },
    kamikakushi: { name: '神隠し ようじょ贄', cost: 0, automatic: false, description: 'このターン中、手札から幼女を直接お昼寝場所に捨てるたびに、相手のお菓子を捨てた人数×2個奪う。1ターンに1回。' },
};
/** Used by hand at most once a turn (`lastTurn` is the turn of the last use). */
export const oncePerTurn: readonly ExSkillId[] = ['alice', 'kamikakushi'];

export function activateExSkill(s: GameState, side: Side, id: ExSkillId, catalog: Catalog) {
    const p = s.players[side], skill = p.exSkills?.[id], info = exSkillInfo[id];
    if (!skill || !info || info.automatic || skill.uses <= 0 || p.pp < info.cost || oncePerTurn.includes(id) && skill.lastTurn === s.turn) throw new RuleError('このExスキルは使用できません');
    p.pp -= info.cost;
    // 神隠し ようじょ贄: works for the rest of this turn; core/zones.ts `discard` does the stealing.
    if (id === 'kamikakushi') { skill.uses--; skill.lastTurn = s.turn; }
    if (id === 'strawberryHunt') { skill.uses--; s.players[other(side)].strawberryOnlyUntil = s.turn + 1; }
    if (id === 'alice') { skill.lastTurn = s.turn; effects(s, catalog, side).queue('allBuff', { scope: 'friendly', amount: 3, hp: 3 }); }
    // Using an Exスキル is not an action for the stall rule (repeating アリス would never end the match).
    // An Exスキル is not one of the playable's skills: cards reacting to a skill (ぶどうのとここ) do not react.
}
