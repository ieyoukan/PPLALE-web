// 膠着の決着: no draw, play, unit action or skill for three turns in a row (or for certain from now
// on) ends the match; more sweet points wins, the second player wins a tie.
import { skillsFor } from '../playables/skills.ts';
import { other, sides } from '../model.ts';
import type { Catalog, GameState, Side } from '../model.ts';
import { attackOf, note } from './cards.ts';

/** Consecutive turns without any action that end the match. A turn is one player's turn. */
export const STALL_TURNS = 3;

/** Records one of the four actions (draw, play, unit action, skill) for the current turn. */
export function markAction(s: GameState) {
    if (s.phase !== 'playing') return;
    s.stall = { acted: true, idleTurns: s.stall?.idleTurns ?? 0 };
}

/** Neither side can ever act again: no cards to draw or play, no unit that can attack, no skill left. */
function certainlyStuck(s: GameState, catalog: Catalog): boolean {
    return sides.every(side => {
        const p = s.players[side];
        if (p.yojo.length || p.sweet.length || p.hand.length) return false;
        if ((p.acorns ?? 0) > 0 || (p.exSkills?.alice?.uses ?? 0) > 0 || (p.exSkills?.strawberryHunt?.uses ?? 0) > 0) return false;
        if (p.field.some(uid => attackOf(s.cards[uid], catalog) > 0 && !s.cards[uid].keywords.includes('immobile'))) return false;
        // The common skill (index 0) needs a unit on the field; with no cards left none can arrive.
        return skillsFor(p.playable).every((_, index) => p.skills[index] <= 0 || index === 0 && !p.field.length);
    });
}

const winnerByPoints = (s: GameState): Side => {
    const [a, b] = s.players, second = other(s.rules.firstPlayer);
    return a.points === b.points ? second : a.points > b.points ? 0 : 1;
};

/** Called when a turn ends. Returns true when the match was ended by the stall rule. */
export function settleStall(s: GameState, catalog: Catalog): boolean {
    const idleTurns = s.stall?.acted ? 0 : (s.stall?.idleTurns ?? 0) + 1;
    s.stall = { acted: false, idleTurns };
    const stuck = certainlyStuck(s, catalog);
    if (idleTurns < STALL_TURNS && !stuck) return false;
    s.winner = winnerByPoints(s);
    const [a, b] = s.players;
    note(s, `${stuck && idleTurns < STALL_TURNS ? 'お互いに行動できなくなったため' : `行動のないターンが${STALL_TURNS}回続いたため`}試合終了：お菓子ポイント ${a.points} 対 ${b.points}${a.points === b.points ? '（同数のため後攻の勝利）' : ''}`);
    return true;
}
