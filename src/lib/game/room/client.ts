// The browser's side of a room: asking the room server (services/room-server) for a room or a
// seat, the seats kept in this browser, and the socket a seat talks through.
// Without NEXT_PUBLIC_ROOM_SERVER_URL there are no room matches.
import type { ClientMessage, RoomAction, RoomInfo, RoomRules, RoomServerStats, RoomView, SeatKey, Seated, ServerMessage } from '@pplale/game-core/room';

export const roomServerUrl = (process.env.NEXT_PUBLIC_ROOM_SERVER_URL ?? '').replace(/\/+$/, '') || null;

/** A request the server refused (or that never reached it: status 0); `message` can be shown. */
export class RoomRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
const UNREACHABLE = 'ルームサーバーにつながりません。少し待ってからお試しください';

async function call<T>(path: string, body?: unknown): Promise<T> {
  if (!roomServerUrl) throw new RoomRequestError(0, 'ルームサーバーが設定されていません');
  let response: Response;
  try {
    response = await fetch(roomServerUrl + path, {
      method: body === undefined ? 'GET' : 'POST', cache: 'no-store', signal: AbortSignal.timeout(8000),
      ...(body !== undefined && { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
  } catch { throw new RoomRequestError(0, UNREACHABLE); }
  const data = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok || !data) throw new RoomRequestError(response.status, data?.error ?? 'サーバーで問題が起きました');
  return data;
}

export const createRoom = (rules: RoomRules, name: string) => call<Seated>('/rooms', { rules, name });
export const joinRoom = (id: string, name: string) => call<Seated>(`/rooms/${id}/join`, { name });
export const readRoomInfo = (id: string) => call<RoomInfo>(`/rooms/${id}`);
/** How the server is doing: also the way to find out whether it can be reached at all. */
export const readServerStats = () => call<RoomServerStats>('/stats');

// ── The seats of this browser ──
const SEATS_KEY = 'pplale-room-seats-v2';
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
export function keepSeat(id: string, { seat, token }: SeatKey) {
  current.set(id, { seat, token });
  writeSeats({ ...seats(), [id]: { seat, token, at: Date.now() } });
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

// ── The socket of a seat ──
const RETRY_DELAYS = [500, 1000, 2000, 4000];

export interface RoomConnection {
  /** Sends a request of the seat. Resolves once the server did it (its view has arrived by then); rejects with RoomRequestError. */
  send(action: RoomAction): Promise<void>;
  close(): void;
}

/**
 * Keeps a socket to the room open for the seat (or, without a token, for a spectator) until `close`: `onView` gets the view now and
 * after every change, `onLink` whether the socket is up (it connects again by itself when it drops),
 * `onGone` is called once when the room or the seat no longer exists.
 */
export function connectRoom(id: string, token: string | null, handlers: { onView: (view: RoomView) => void; onLink: (up: boolean) => void; onGone: (message: string) => void }): RoomConnection {
  let socket: WebSocket | null = null, stopped = false, attempt = 0, n = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const waiting = new Map<number, { resolve: () => void; reject: (error: RoomRequestError) => void }>();
  const failWaiting = () => {
    for (const { reject } of Array.from(waiting.values())) reject(new RoomRequestError(0, '接続が切れました。もう一度操作してください'));
    waiting.clear();
  };
  function open() {
    if (stopped || !roomServerUrl) return;
    const next = socket = new WebSocket(`${roomServerUrl.replace(/^http/, 'ws')}/rooms/${id}/socket`);
    next.addEventListener('open', () => next.send(JSON.stringify((token === null ? { type: 'hello', watch: true } : { type: 'hello', token }) satisfies ClientMessage)));
    next.addEventListener('message', event => {
      if (stopped || socket !== next) return;
      const message = JSON.parse(String(event.data)) as ServerMessage;
      if (message.type === 'view') {
        attempt = 0;
        handlers.onLink(true);
        handlers.onView(message.view);
      } else if (message.type === 'result') {
        const asked = waiting.get(message.n);
        waiting.delete(message.n);
        if (message.error) asked?.reject(new RoomRequestError(400, message.error));
        else asked?.resolve();
      } else {
        stopped = true;
        failWaiting();
        handlers.onGone(message.error);
      }
    });
    next.addEventListener('close', () => {
      if (stopped || socket !== next) return;
      socket = null;
      failWaiting();
      handlers.onLink(false);
      timer = setTimeout(open, RETRY_DELAYS[Math.min(attempt++, RETRY_DELAYS.length - 1)]);
    });
  }
  open();
  return {
    send(action) {
      return new Promise((resolve, reject) => {
        if (!socket || socket.readyState !== WebSocket.OPEN) return reject(new RoomRequestError(0, UNREACHABLE));
        const number = ++n;
        waiting.set(number, { resolve, reject });
        socket.send(JSON.stringify({ type: 'action', n: number, action } satisfies ClientMessage));
      });
    },
    close() {
      stopped = true;
      if (timer) clearTimeout(timer);
      failWaiting();
      socket?.close();
    },
  };
}
