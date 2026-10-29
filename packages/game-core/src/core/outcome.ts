// 勝者と決着理由を同時に確定する。すべての決着をdecideMatchへ集約する。
import { other } from '../model.ts';
import type { GameState, Side, WinReason } from '../model.ts';

/**
 * Ends the match for `winner`. The first decision stands: a later one in the same step (e.g. the
 * points check after a card already decided the match) changes nothing.
 */
export function decideMatch(s: GameState, winner: Side, reason: WinReason) {
    if (s.winner !== null) return;
    s.winner = winner;
    s.winReason = reason;
}

/**
 * Why a finished match ended. Saves from before the reason was recorded only know the winner:
 * the loser at 0 points lost on points, anything else was judged by the stall rule.
 */
export function winReasonOf(s: Pick<GameState, 'winner' | 'winReason' | 'players' | 'rules'>): WinReason | null {
    if (s.winner === null) return null;
    if (s.winReason) return s.winReason;
    const winner = s.winner === 'draw' ? other(s.rules.firstPlayer) : s.winner;
    return s.players[other(winner)].points <= 0 ? 'points' : 'stall';
}
