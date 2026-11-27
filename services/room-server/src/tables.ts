// ルームの卓。ルーム自身が1卓目（旧形式のまま読める）で、2卓目以降は room.tables に持つ。
// 対戦の処理（rooms.ts・turn-clock.ts など）は「ルーム」を受け取るので、卓ごとに、その卓の対戦を
// 持つルームの形（focus）にして渡す。変更は withTable で卓へ書き戻す。
import type { Room, Table } from './rooms.ts';

/** 卓ごとに持つ項目。これ以外（ID・ルール・在室情報など）はルーム全体で1つ。 */
const TABLE_FIELDS = ['turnClock', 'discardedMatch', 'record', 'status', 'match', 'seats', 'state', 'last', 'resigned', 'away', 'changed'] as const satisfies readonly (keyof Table)[];

export const tableCount = (room: Room) => 1 + (room.tables?.length ?? 0);
/** 卓の番号（0から）。範囲外はnull。 */
export const tableAt = (room: Room, index: number): Table | null => index === 0 ? room : room.tables?.[index - 1] ?? null;
/** すべての卓の番号。 */
export const tableIndexes = (room: Room) => Array.from({ length: tableCount(room) }, (_, index) => index);

/** 空の卓。 */
export const emptyTable = (): Table => ({ status: 'lobby', match: 0, seats: [null, null], state: null, last: null, resigned: null });

/**
 * その卓の対戦を持つルームの形。1卓目はルームそのもの。2卓目以降は読み取り用の写しで、
 * 在室情報（plaza）などはルームと同じものを指す。変更するときは withTable を使う。
 */
export function focus(room: Room, index: number): Room {
    if (index === 0) return room;
    const table = tableAt(room, index);
    if (!table) throw new Error(`no table ${index}`);
    const view = { ...room };
    delete view.tables;
    for (const field of TABLE_FIELDS) delete view[field];
    return Object.assign(view, table);
}

/**
 * 卓の対戦を変更する。`change` は、その卓をルームとして受け取る（rooms.ts の処理をそのまま使える）。
 * 卓の項目は卓へ書き戻し、在室情報など共有の項目は同じものを変更する。この卓の changed を進める。
 */
export function withTable<T>(room: Room, index: number, change: (table: Room) => T): T {
    const target = focus(room, index);
    const result = change(target);
    target.changed = room.version + 1;
    if (index === 0) return result;
    const table = tableAt(room, index)!;
    for (const field of TABLE_FIELDS) {
        if (target[field] === undefined) delete table[field];
        else (table as unknown as Record<string, unknown>)[field] = target[field];
    }
    return result;
}
