// dice → initiative → opening → mulligan → playing, and the start of each turn.
import { maxPp, note } from '../core/cards.ts';
import { resolveQueue } from '../effects/resolve.ts';
import type { Catalog, GameState, Side } from '../model.ts';

export function startTurn(s: GameState, side: Side) {
    s.active = side;
    s.turn++;
    const p = s.players[side];
    p.turns++;
    p.pp = Math.max(0, maxPp(s, side) - p.nextPpDebt);
    p.nextPpDebt = 0;
    p.field.forEach(uid => { s.cards[uid].exhausted = false; });
    note(s, `${p.name}の${p.turns}ターン目`);
}

const idle = (s: GameState) => !s.pending && !s.queue.length && s.winner === null;

/** Moves to the next phase once the current one is finished. Called after every command. */
export function advancePhase(s: GameState, catalog: Catalog) {
    if (s.phase === 'opening' && s.openingRemaining.every(count => count === 0) && idle(s)) {
        s.phase = 'mulligan';
        s.active = s.rules.firstPlayer;
        s.mulligan.eligible = [[...s.players[0].hand], [...s.players[1].hand]];
        note(s, '初期手札は各カード1回だけ交換できます。準備ができたら手札を決定してください');
    }
    if (s.phase === 'mulligan' && s.mulligan.confirmed.every(Boolean) && idle(s)) {
        s.phase = 'playing';
        startTurn(s, s.rules.firstPlayer);
        if (s.rules.firstTurnDraw) {
            s.queue.push({ op: 'draw', actor: s.active, text: 'turn' });
            resolveQueue(s, catalog);
        }
    }
}
