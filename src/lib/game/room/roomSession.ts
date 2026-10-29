// ルームへの再入室情報だけを保存する。通信や画面遷移には依存させない。
import type { SeatKey } from '@pplale/game-core/room';

// 旧2席ルームの座席情報。入室中はメモリにも保持する。
const SEATS_KEY = 'pplale-room-seats-v2';
const KEPT_SEATS = 8;
type Seats = Record<string, SeatKey & { at: number }>;
function seats(): Seats {
  try { return JSON.parse(localStorage.getItem(SEATS_KEY) ?? '{}') as Seats; } catch { return {}; }
}
function writeSeats(next: Seats) {
  // 古いルームは閉じているため、最近の参加情報だけを保持する。
  const latest = Object.entries(next).sort((a, b) => b[1].at - a[1].at).slice(0, KEPT_SEATS);
  try { localStorage.setItem(SEATS_KEY, JSON.stringify(Object.fromEntries(latest))); } catch { /* 保存できない場合は、このページを閉じるまでだけ保持する。 */ }
}
const current = new Map<string, SeatKey>();
export function seatFor(id: string): SeatKey | null {
  return current.get(id) ?? seats()[id] ?? null;
}
export function keepSeat(id: string, { seat, token }: SeatKey) {
  current.set(id, { seat, token });
  writeSeats({ ...seats(), [id]: { seat, token, at: Date.now() } });
}
export function dropSeat(id: string) {
  current.delete(id);
  const rest = seats();
  delete rest[id];
  writeSeats(rest);
}

// 現在のルームと、最近入ったルームの再入室用トークン。
const PLAZA_KEY = 'pplale-plaza-v1';
const KEPT_PLAZAS = 8;
/** 再入室と共有に使う、そのルームの最新の招待情報。 */
interface PlazaKey { token: string; invite?: string; at: number }
interface Plazas { current: string | null; rooms: Record<string, PlazaKey> }
function plazas(): Plazas {
  try {
    const saved = JSON.parse(localStorage.getItem(PLAZA_KEY) ?? 'null') as Plazas | null;
    return saved && typeof saved === 'object' && saved.rooms ? saved : { current: null, rooms: {} };
  } catch { return { current: null, rooms: {} }; }
}
function writePlazas(next: Plazas) {
  const latest = Object.entries(next.rooms).sort((a, b) => b[1].at - a[1].at).slice(0, KEPT_PLAZAS);
  try { localStorage.setItem(PLAZA_KEY, JSON.stringify({ current: next.current, rooms: Object.fromEntries(latest) })); } catch { /* 保存できない場合は、このページ内だけで保持する。 */ }
}
export const plazaKey = (id: string): PlazaKey | null => plazas().rooms[id] ?? null;
/** ゲームを開き直したときに戻る、現在のルーム。 */
export const currentPlaza = (): (PlazaKey & { id: string }) | null => {
  const saved = plazas(), id = saved.current;
  return id && saved.rooms[id] ? { id, ...saved.rooms[id] } : null;
};
export function keepPlaza(id: string, key: Omit<PlazaKey, 'at'>, current = true) {
  const saved = plazas();
  writePlazas({ current: current ? id : saved.current, rooms: { ...saved.rooms, [id]: { ...saved.rooms[id], ...key, at: Date.now() } } });
}
/** ルームから受け取った最新の招待情報を記憶する。 */
export function keepInvite(id: string, invite: string) {
  const saved = plazas();
  if (saved.rooms[id] && saved.rooms[id].invite !== invite) writePlazas({ ...saved, rooms: { ...saved.rooms, [id]: { ...saved.rooms[id], invite } } });
}
/** 現在のルームから離れる。後継ルームを作る証明としてトークンを残す場合もある。 */
export function leavePlaza(id: string, forget = true) {
  const saved = plazas(), rooms = { ...saved.rooms };
  if (forget) delete rooms[id];
  writePlazas({ current: saved.current === id ? null : saved.current, rooms });
}

/** 入室可能なルームを問い合わせるための、端末が保持している参加情報。 */
export function knownPlazas() {
  return Object.entries(plazas().rooms)
    .slice(0, KEPT_PLAZAS)
    .map(([id, key]) => ({ id, token: key.token, ...(key.invite && { invite: key.invite }) }));
}
