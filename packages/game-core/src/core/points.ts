// お菓子ポイント: 食べる / 奪う / 減らす / 回復.
import { other } from '../model.ts';
import type { GameState, Side } from '../model.ts';
import { note } from './cards.ts';

export type PointLoss = 'eat' | 'steal' | 'reduce';

export function heal(s: GameState, side: Side, amount: number) {
    const p = s.players[side];
    p.points = Math.min(p.maxPoints, p.points + amount);
}

/**
 * Removes sweet points from `side`.
 * - 奪う: blocked by enemy 挑発; if successful, heals the actor by X (up to their maximum).
 * - 食べる / 奪う: blocked by パンケーキ once, after the taunt check.
 * - 減らす: never blocked.
 */
export function losePoints(s: GameState, side: Side, amount: number, mode: PointLoss): { lost: number; blocked?: 'taunt' | 'shield' } {
    const p = s.players[side];
    if (amount <= 0) return { lost: 0 };
    if (mode === 'steal' && p.field.some(uid => s.cards[uid].keywords.includes('taunt'))) {
        note(s, '挑発がお菓子を奪う効果を無効化しました');
        return { lost: 0, blocked: 'taunt' };
    }
    if (mode !== 'reduce') {
        if (p.shield) {
            p.shield = false;
            note(s, 'パンケーキが一度だけ無効化しました');
            return { lost: 0, blocked: 'shield' };
        }
    }
    const before = p.points;
    p.points = Math.max(0, p.points - amount);
    note(s, `${p.name}：お菓子ポイント ${before} → ${p.points}`);
    for (const threshold of [10, 5]) {
        if (before > threshold && p.points <= threshold && !p.milestones.includes(threshold)) {
            p.milestones.push(threshold);
            note(s, `${threshold}ポイント到達：お菓子を1枚引くことができます`);
            s.queue.push({ op: 'draw', actor: side, deck: 'sweet', text: 'threshold' });
        }
    }
    if (mode === 'steal') heal(s, other(side), amount);
    return { lost: before - p.points };
}
