// The browser's side of a room: the API calls, the seat kept in this browser, and following the
// seat's view as it changes.
import type { RoomRules } from './rules';
import type { RoomAction, RoomInfo, RoomView, SeatKey, Seated } from './types';

const url = (id?: string) => id ? `/api/rooms/${id}/` : '/api/rooms/';

/** A request the server refused; `status` is its HTTP status and `message` can be shown. */
export class RoomRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

async function call<T>(target: string, options: { token?: string; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(target, {
      method: options.body === undefined ? 'GET' : 'POST', cache: 'no-store',
      headers: { ...(options.body !== undefined && { 'content-type': 'application/json' }), ...(options.token && { authorization: `Bearer ${options.token}` }) },
      ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
    });
  } catch { throw new RoomRequestError(0, 'サーバーにつながりません。接続を確認してください'); }
  const data = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok || !data) throw new RoomRequestError(response.status, data?.error ?? 'サーバーで問題が起きました');
  return data;
}

export const createRoom = (rules: RoomRules, name: string) => call<Seated>(url(), { body: { rules, name } });
export const joinRoom = (id: string, name: string) => call<Seated>(url(id), { body: { action: 'join', name } });
export const readRoomInfo = (id: string) => call<RoomInfo>(url(id));
export const readRoomView = (id: string, token: string) => call<RoomView>(url(id), { token });
export const sendRoomAction = (id: string, token: string, action: RoomAction) => call<RoomView>(url(id), { token, body: action });

// ── The seats of this browser ──
const SEATS_KEY = 'pplale-room-seats-v1';
const KEPT_SEATS = 8;
type Seats = Record<string, SeatKey & { at: number }>;
function seats(): Seats {
  try { return JSON.parse(localStorage.getItem(SEATS_KEY) ?? '{}') as Seats; } catch { return {}; }
}
function writeSeats(next: Seats) {
  // Old rooms are gone on the server too; only the latest few are worth keeping.
  const latest = Object.entries(next).sort((a, b) => b[1].at - a[1].at).slice(0, KEPT_SEATS);
  try { localStorage.setItem(SEATS_KEY, JSON.stringify(Object.fromEntries(latest))); } catch { /* The seat then lasts until the page is closed. */ }
}
const current = new Map<string, SeatKey>();
export function seatFor(id: string): SeatKey | null {
  return current.get(id) ?? seats()[id] ?? null;
}
export function keepSeat(id: string, { seat, token, viewKey }: SeatKey) {
  current.set(id, { seat, token, viewKey });
  writeSeats({ ...seats(), [id]: { seat, token, viewKey, at: Date.now() } });
}
/** The room this browser sat in last, for a way back to it. */
export function latestRoom(): string | null {
  return Object.entries(seats()).sort((a, b) => b[1].at - a[1].at)[0]?.[0] ?? null;
}
export function dropSeat(id: string) {
  current.delete(id);
  const rest = seats();
  delete rest[id];
  writeSeats(rest);
}

const POLL_INTERVAL = 1500;

/**
 * Calls `onView` with the seat's view now and whenever it changes, until the returned function is
 * called. Listens to the published view; where there is none (or listening fails) it asks the API
 * again and again instead. `onGone` is called once when the room or the seat no longer exists.
 */
export function watchRoom(id: string, key: SeatKey, onView: (view: RoomView) => void, onGone: (error: RoomRequestError) => void): () => void {
  let stopped = false, stopListening: (() => void) | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  const poll = async () => {
    if (stopped) return;
    try {
      const view = await readRoomView(id, key.token);
      if (!stopped) onView(view);
    } catch (error) {
      if (stopped) return;
      if (error instanceof RoomRequestError && [401, 404, 410].includes(error.status)) return onGone(error);
    }
    timer = setTimeout(poll, POLL_INTERVAL);
  };
  if (!key.viewKey) void poll();
  else void Promise.all([import('firebase/firestore'), import('@/lib/firebase')]).then(([sdk, { db }]) => {
    if (stopped) return;
    stopListening = sdk.onSnapshot(sdk.doc(db, 'roomViews', key.viewKey!), snapshot => {
      const json: unknown = snapshot.get('json');
      if (typeof json === 'string') return onView(JSON.parse(json) as RoomView);
      // The published view is gone (the room expired): the API says what is left.
      stopListening?.();
      stopListening = undefined;
      void poll();
    }, () => { stopListening = undefined; void poll(); });
  }).catch(() => { void poll(); });
  return () => {
    stopped = true;
    stopListening?.();
    if (timer) clearTimeout(timer);
  };
}
