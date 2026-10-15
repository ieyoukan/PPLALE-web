// dice → initiative → opening → mulligan → playing, and the start of each turn.
import { availablePpMaximum, expireTimed, note } from '../core/cards.ts';
import { settleStall } from '../core/stall.ts';
import { resolveQueue } from '../effects/resolve.ts';
import { other } from '../model.ts';
import type { Catalog, GameState, Side } from '../model.ts';
import { scriptFor } from '../cards/registry.ts';
import { cardContext } from '../effects/context.ts';

export function startTurn(s: GameState, side: Side) {
    s.active = side;
    s.turn++;
    const p = s.players[side];
    p.turns++;
    p.turnPpBonus = side !== s.rules.firstPlayer && p.turns === 5 ? 2 : 0;
    p.pp = Math.max(0, availablePpMaximum(s, side) - p.nextPpDebt);
    p.nextPpDebt = 0;
    p.field.forEach(uid => { s.cards[uid].exhausted = false; delete s.cards[uid].actions; });
    for (const uid of s.players.flatMap(player => player.field)) expireTimed(s, uid);
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
        s.queue.push({ op: 'beginTurn', actor: s.rules.firstPlayer });
        resolveQueue(s, catalog);
    }
}

/** Called after hand-limit exclusions, while the ending side is still active. */
export function finishTurn(s: GameState, side: Side, catalog: Catalog) {
    const p = s.players[side];
    p.hand.forEach(uid => { s.cards[uid].temporaryCost = 0; });
    // The PP left stays through the opponent's turn (cards pay or count it then) and is replaced at
    // this player's next turn (user ruling).
    p.turnPpBonus = 0;
    // 行動不能 given 「〜ターン終了時まで」 ends with the turn it was given up to.
    for (const uid of s.players.flatMap(player => player.field)) {
        const card = s.cards[uid];
        if (card.immobileUntil !== undefined && card.immobileUntil <= s.turn) delete card.immobileUntil;
    }
    // 膠着: three turns without any action (or none possible ever) end the match on points.
    if (settleStall(s, catalog)) return;
    s.queue.push({ op: 'beginTurn', actor: other(side) });
}

export function beginTurn(s: GameState, side: Side, catalog: Catalog) {
    startTurn(s, side);
    for (const uid of s.players[side].field) s.cards[uid].hiding = false;
    for (const owner of [side, other(side)]) {
        const p = s.players[owner];
        for (const zone of ['field', 'hand'] as const) for (const uid of [...p[zone]])
            scriptFor(s, uid).onTurnStart?.(cardContext(s, catalog, owner, uid), side, zone);
    }
    s.queue.push({ op: 'turnDraw', actor: side });
}
