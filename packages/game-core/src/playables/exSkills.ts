import { RuleError, other } from '../model.ts';
import type { Catalog, ExSkillId, GameState, Side } from '../model.ts';
import { scriptFor } from '../cards/registry.ts';
import { cardContext, effects } from '../effects/context.ts';
import { markAction } from '../core/stall.ts';

export const exSkillInfo: Record<ExSkillId, { name: string; cost: number; automatic: boolean; description: string }> = {
    dice: { name: 'クマはサイコロを振らない', cost: 0, automatic: true, description: '1d6を振るとき、出目を指定する。' },
    strawberryHunt: { name: 'イチゴ狩り', cost: 3, automatic: false, description: '次の相手ターンはイチゴタイプの幼女だけプレイ可能。' },
    healing: { name: 'ここあの献身', cost: 0, automatic: true, description: 'お菓子ポイントの回復量を+1。' },
    abyss: { name: 'アビスの深淵', cost: 0, automatic: true, description: '味方幼女が破壊されると相手のお菓子ポイントを1減らす。' },
    dagger: { name: 'ダブルダガー', cost: 0, automatic: true, description: '自分ターンの効果によるPP回復を+2。1ターン2回。' },
    alice: { name: '不思議の国のアリス', cost: 0, automatic: false, description: '味方全員を+3/+3。1ターン1回。' },
    smoke: { name: '魅惑の水煙', cost: 0, automatic: true, description: 'カード効果で引いた枚数だけ自分のお菓子ポイントを減らす。' },
};

export function activateExSkill(s: GameState, side: Side, id: ExSkillId, catalog: Catalog) {
    const p = s.players[side], skill = p.exSkills?.[id], info = exSkillInfo[id];
    if (!skill || !info || info.automatic || skill.uses <= 0 || p.pp < info.cost || id === 'alice' && skill.lastTurn === s.turn) throw new RuleError('このExスキルは使用できません');
    p.pp -= info.cost;
    if (id === 'strawberryHunt') { skill.uses--; s.players[other(side)].strawberryOnlyUntil = s.turn + 1; }
    if (id === 'alice') { skill.lastTurn = s.turn; effects(s, catalog, side).queue('allBuff', { scope: 'friendly', amount: 3, hp: 3 }); }
    markAction(s);
    for (const owner of [side, other(side)]) for (const uid of s.players[owner].field)
        scriptFor(s, uid).onSkill?.(cardContext(s, catalog, owner, uid));
}
