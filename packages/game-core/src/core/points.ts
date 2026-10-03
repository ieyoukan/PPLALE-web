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
 * - 食べる / 奪う: blocked by the defender's taunt, then by パンケーキ once.
 * - 減らす: never blocked.
 * Returns `blocked: 'taunt'` when nothing was even attempted, so callers can tell that apart from
 * a barrier that nullified the change (FAQ: the unit still counts as having eaten).
 */
export function losePoints(s: GameState, side: Side, amount: number, mode: PointLoss): { lost: number; blocked?: 'taunt' | 'shield' } {
    const p = s.players[side];
    if (mode !== 'reduce') {
        if (p.field.some(uid => s.cards[uid].keywords.includes('taunt'))) {
            note(s, '挑発によってお菓子が守られました');
            return { lost: 0, blocked: 'taunt' };
        }
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
            note(s, `${threshold}ポイント到達：お菓子を1枚ドロー`);
            s.queue.push({ op: 'draw', actor: side, deck: 'sweet', text: 'threshold' });
        }
    }
    if (mode === 'steal' && s.rules.stealHeals) heal(s, other(side), before - p.points);
    return { lost: before - p.points };
}
