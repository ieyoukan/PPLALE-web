// 操作を受理した時点のエンジンとカード定義で表示情報を記録する。更新中も別バージョンで計算し直さない。
import { attackOf, hpOf, costOf, availablePpMaximum } from '@pplale/game-core';
import { createValueEvaluator, valueModel } from '@pplale/game-core/ai';
import type { Catalog, GameState, Side } from '@pplale/game-core';
import type { ReplayFrame } from '@pplale/game-core/history';
export interface SnapshotCapture { catalogId: string; engineVersion: string; presentation: ReplayFrame['presentation'] }
const evaluate = createValueEvaluator(valueModel);
export function captureState(state: GameState, catalog: Catalog, catalogId: string, engineVersion: string): SnapshotCapture {
    const holders = new Map<string, Side>();
    for (const side of [0, 1] as const) for (const zone of ['yojo', 'sweet', 'hand', 'field', 'nap', 'exile'] as const) for (const uid of state.players[side][zone]) holders.set(uid, side);
    // Capture a cheap position value with the accepting engine, without delaying commands for AI search.
    // A recording is only available after the match; both hands are visible there.
    const win = state.winner !== null ? state.winner === 0 ? 1 : state.winner === 1 ? 0 : 0.5
        : 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, evaluate(state, 0, catalog) / valueModel.scale))));
    return {
        catalogId, engineVersion,
        presentation: {
            cards: Object.fromEntries(Object.values(state.cards).map(card => [card.uid, { attack: attackOf(card, catalog), hp: hpOf(card, catalog), cost: costOf(state, card.uid, catalog, holders.get(card.uid) ?? card.owner ?? 0) }])),
            ppMaximum: [availablePpMaximum(state, 0), availablePpMaximum(state, 1)],
            ...(state.phase === 'playing' && { assessment: { win, method: 'position-value-v1' as const } }),
        },
    };
}
