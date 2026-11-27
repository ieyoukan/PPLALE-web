// ルームのトーナメント（勝ち抜き戦）。サーバーが持ち、ルームの全員へそのまま返す。
// 組み合わせは参加者の並び（1回戦は 0-1, 2-3, …）で決まり、各試合には勝った側だけを記録する。
// 2回戦以降の対戦者は、前の回の勝者から求める。参加者が2の累乗に足りない分は不戦勝（null）。
import type { Side } from './model.ts';

export interface TournamentEntrant {
    /** ルームのメンバーID。退出しても表のなかでは名前を残す。 */
    member: string;
    name: string;
    profileId?: string;
}
export interface TournamentMatch {
    /** 勝った側（0は上、1は下）。未決着はnull。 */
    winner: Side | null;
    /** 呼ばれて、いま行っている卓（0から）。 */
    table?: number;
    /** 決着した対戦の記録ID（リプレイ）。不戦勝や手で決めた結果にはない。 */
    matchId?: string;
}
export interface PlazaTournament {
    id: string;
    /** 表の並び。長さは2の累乗で、nullは不戦勝の空き。 */
    entrants: (TournamentEntrant | null)[];
    /** rounds[回][試合]。1回戦は entrants.length / 2 試合、決勝は1試合。 */
    rounds: TournamentMatch[][];
}
/** トーナメントに出られる人数。 */
export const TOURNAMENT_SIZE = { min: 2, max: 16 } as const;

/** 参加者を表に並べる。`order` は抽選済みの並び。不戦勝は1回戦の別々の試合に1つずつ置く。 */
export function newTournament(id: string, order: TournamentEntrant[]): PlazaTournament {
    let size = 2;
    while (size < order.length) size *= 2;
    const byes = size - order.length, entrants: (TournamentEntrant | null)[] = [];
    let next = 0;
    for (let match = 0; match < size / 2; match++) {
        entrants.push(order[next++]);
        entrants.push(match < byes ? null : order[next++]);
    }
    const rounds: TournamentMatch[][] = [];
    for (let count = size / 2; count >= 1; count /= 2) rounds.push(Array.from({ length: count }, () => ({ winner: null })));
    // A bye wins at once.
    rounds[0].forEach((match, index) => { if (!entrants[index * 2 + 1]) match.winner = 0; });
    return { id, entrants, rounds };
}

/** その試合の上下の対戦者（参加者の番号）。まだ決まっていない、または不戦勝の空きはnull。 */
export function matchPlayers(tournament: PlazaTournament, round: number, index: number): [number | null, number | null] {
    if (round === 0) return [0, 1].map(side => tournament.entrants[index * 2 + side] ? index * 2 + side : null) as [number | null, number | null];
    return [winnerOf(tournament, round - 1, index * 2), winnerOf(tournament, round - 1, index * 2 + 1)];
}
/** その試合の勝者（参加者の番号）。未決着はnull。 */
export function winnerOf(tournament: PlazaTournament, round: number, index: number): number | null {
    const match = tournament.rounds[round]?.[index];
    if (!match || match.winner === null) return null;
    return matchPlayers(tournament, round, index)[match.winner];
}
/** 優勝者（参加者の番号）。決勝が終わるまではnull。 */
export const championOf = (tournament: PlazaTournament) => winnerOf(tournament, tournament.rounds.length - 1, 0);

/** 試合の様子。waitingは対戦者待ち、readyは呼べる、playingは卓で対戦中（呼ばれた後を含む）、doneは決着。 */
export type TournamentMatchState = 'waiting' | 'ready' | 'playing' | 'done';
export function matchState(tournament: PlazaTournament, round: number, index: number): TournamentMatchState {
    const match = tournament.rounds[round][index];
    if (match.winner !== null) return 'done';
    if (match.table !== undefined) return 'playing';
    return matchPlayers(tournament, round, index).every(player => player !== null) ? 'ready' : 'waiting';
}
/** 回の呼び名：決勝・準決勝・それ以前は「n回戦」。 */
export function roundName(tournament: PlazaTournament, round: number): string {
    const left = tournament.rounds.length - round;
    return left === 1 ? '決勝' : left === 2 ? '準決勝' : `${round + 1}回戦`;
}
