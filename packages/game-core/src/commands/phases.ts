// dice → initiative → opening → mulligan → playing, and the start of each turn.
import { availablePpMaximum, note } from '../core/cards.ts';
import { resolveQueue } from '../effects/resolve.ts';
import { other } from '../model.ts';
import type { Catalog, GameState, Side } from '../model.ts';

export function startTurn(s: GameState, side: Side) {
    s.active = side;
    s.turn++;
    const p = s.players[side];
    p.turns++;
    p.turnPpBonus = side !== s.rules.firstPlayer && p.turns === 5 ? 2 : 0;
    p.pp = Math.max(0, availablePpMaximum(s, side) - p.nextPpDebt);
    p.nextPpDebt = 0;
    p.field.forEach(uid => { s.cards[uid].exhausted = false; });
    note(s, `${p.name}の${p.turns}ターン目`);
    if (p.turnPpBonus) note(s, '後攻5ターン目：このターンだけ追加2PP');
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
        s.queue.push({ op: 'draw', actor: s.active, text: 'turn' });
        resolveQueue(s, catalog);
    }
}

/** Called after hand-limit exclusions, while the ending side is still active. */
export function finishTurn(s: GameState, side: Side) {
    const p = s.players[side];
    p.hand.forEach(uid => { s.cards[uid].temporaryCost = 0; });
    p.pp = 0;
    p.turnPpBonus = 0;
    startTurn(s, other(side));
    s.queue.push({ op: 'draw', actor: s.active, text: 'turn' });
}
