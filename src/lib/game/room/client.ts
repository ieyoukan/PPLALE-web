// The browser's side of a room: asking the room server (services/room-server) for a room or a
// seat, the seats kept in this browser, and the socket a seat talks through.
// Without NEXT_PUBLIC_ROOM_SERVER_URL there are no room matches.
import { historyHeaders } from './historyIdentity';
import { playTiming } from './playTiming';
import { recordPlaySample } from './performanceLog';
import { isPlayKind } from '@pplale/game-core/performance';
import type { PlayReport } from '@pplale/game-core/performance';
import type { HistoryPage, MatchDetails, MatchRecording } from '@pplale/game-core/history';
import type { Deck } from '@pplale/game-core';
import type { ClientMessage, Entered, FreeMatchStatus, PlazaRequest, RoomAction, RoomInfo, ProfileLocation, RoomRules, RoomServerStats, RoomView, SeatKey, Seated, ServerMessage } from '@pplale/game-core/room';

export const roomServerUrl = (process.env.NEXT_PUBLIC_ROOM_SERVER_URL ?? '').replace(/\/+$/, '') || null;

/** A request the server refused (or that never reached it: status 0); `message` can be shown. */
export class RoomRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
const UNREACHABLE = 'ルームサーバーにつながりません。少し待ってからお試しください';

/** `signed`: a GET that says who asks too (a plaza only tells those who may enter it). */
async function call<T>(path: string, body?: unknown, signed = false): Promise<T> {
  if (!roomServerUrl) throw new RoomRequestError(0, 'ルームサーバーが設定されていません');
  const headers = body !== undefined ? { 'content-type': 'application/json', ...await historyHeaders() } : signed ? await historyHeaders() : undefined;
  let response: Response;
  try {
    response = await fetch(roomServerUrl + path, {
      method: body === undefined ? 'GET' : 'POST', cache: 'no-store', signal: AbortSignal.timeout(path.startsWith('/history/') ? 60_000 : 8000),
      ...(headers && { headers }), ...(body !== undefined && { body: JSON.stringify(body) }),
    });
  } catch { throw new RoomRequestError(0, UNREACHABLE); }
  const data = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok || !data) throw new RoomRequestError(response.status, data?.error ?? 'サーバーで問題が起きました');
  return data;
}

export const readMatchHistory = (cursor?: string, favorites = false) => call<HistoryPage>('/history/list', { cursor, favorites });
export const readMatchDetail = (id: string) => call<MatchDetails>(`/history/${id}/detail`, {});
export const readRecording = (id: string) => call<MatchRecording>(`/history/${id}`, {});
export const favoriteMatch = (id: string, value: boolean) => call<{ ok: true }>(`/history/${id}/favorite`, { value });

export const joinRoom = (id: string, name: string) => call<Seated>(`/rooms/${id}/join`, { name });
export const readRoomInfo = (id: string, invite?: string | null) => call<RoomInfo>(`/rooms/${id}${invite ? `?${new URLSearchParams({ invite })}` : ''}`, undefined, true);

// ── Plazas: rooms people gather in (services/room-server/src/plaza.ts) ──
export const createPlaza = (rules: RoomRules, name: string, plaza: PlazaRequest) => call<Entered>('/rooms', { rules, name, plaza });
/** `invite`: the secret of the link this browser came by. `rejoin`: a member secret of this room whose moment away ran out. */
export const enterPlaza = (id: string, name: string, { invite, rejoin }: { invite?: string | null; rejoin?: string | null } = {}) =>
  call<Entered>(`/rooms/${id}/join`, { name, plaza: true, ...(invite && { invite }), ...(rejoin && { rejoin }) });
/** What this player may know of these rooms (only the ones they may enter). */
export const lookupRooms = (ids: string[]) => call<{ rooms: RoomInfo[] }>('/rooms/lookup', { ids });
/** Every non-full plaza this player may enter; the server applies the usual admission rules. */
export const browseRooms = () => call<{ rooms: RoomInfo[] }>('/rooms/browse', {
  known: Object.entries(plazas().rooms).slice(0, KEPT_PLAZAS).map(([id, key]) => ({ id, token: key.token, ...(key.invite && { invite: key.invite }) })),
});
/** Lets a friend into the room by name and tells them (signed in; `member`: this browser's member secret of the room). */
export const inviteFriend = (id: string, member: string, to: string) => call<{ ok: true }>(`/rooms/${id}/invite`, { member, to });
/** Rooms that let this signed-in player in by name. */
export const readInvitations = () => call<{ rooms: RoomInfo[] }>('/rooms/invited', {});
/** A connected friend's profile location; private rooms return only their visibility. */
export const readProfileLocation = (to: string) => call<ProfileLocation>('/rooms/location', { to });
/** Asks to be let into the invited room a friend is in (nothing tells whether there is one). */
export const askToEnter = (to: string) => call<{ ok: true }>('/rooms/ask', { to });
/** How the server is doing: also the way to find out whether it can be reached at all. */
export const readServerStats = () => call<RoomServerStats>('/stats');
// Push notifications (signed-in players only; see src/lib/game/push.ts).
export const readPushKey = () => call<{ publicKey: string | null }>('/push/key');
export const registerPush = (subscription: PushSubscriptionJSON) => call<{ ok: true; enabled: boolean }>('/push/subscribe', { subscription });
export const unregisterPush = (endpoint: string) => call<{ ok: true }>('/push/unsubscribe', { endpoint });
export const pushFriend = (to: string, kind: 'request' | 'accepted') => call<{ ok: true }>('/push/friend', { to, kind });
export const pushRecruit = (roomId: string) => call<{ ok: true }>('/push/recruit', { roomId });

export const startFreeMatch = (token: string, name: string, deck: Deck) => call<FreeMatchStatus>('/free-match/start', { token, name, deck });
export const pollFreeMatch = (token: string) => call<FreeMatchStatus>('/free-match/status', { token });
export const cancelFreeMatch = (token: string) => call<FreeMatchStatus>('/free-match/cancel', { token });
/** Also works while navigating away or closing the page. A lost request expires after 30 seconds. */
export function abandonFreeMatch(token: string) {
  if (!roomServerUrl) return;
  void fetch(`${roomServerUrl}/free-match/cancel`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }), keepalive: true,
  }).catch(() => {});
}

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
export function dropSeat(id: string) {
  current.delete(id);
  const rest = seats();
  delete rest[id];
  writeSeats(rest);
}

// ── The plazas of this browser: the one it is in, and the secrets of those it entered ──
const PLAZA_KEY = 'pplale-plaza-v1';
const KEPT_PLAZAS = 8;
/** `invite`: the latest invitation secret known for the room (to come back in, or to share). */
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
  try { localStorage.setItem(PLAZA_KEY, JSON.stringify({ current: next.current, rooms: Object.fromEntries(latest) })); } catch { /* The room is then kept for this page only. */ }
}
export const plazaKey = (id: string): PlazaKey | null => plazas().rooms[id] ?? null;
/** The room this browser is in (to come back to on opening the game). */
export const currentPlaza = (): (PlazaKey & { id: string }) | null => {
  const saved = plazas(), id = saved.current;
  return id && saved.rooms[id] ? { id, ...saved.rooms[id] } : null;
};
export function keepPlaza(id: string, key: Omit<PlazaKey, 'at'>, current = true) {
  const saved = plazas();
  writePlazas({ current: current ? id : saved.current, rooms: { ...saved.rooms, [id]: { ...saved.rooms[id], ...key, at: Date.now() } } });
}
/** Remembers the latest invitation secret seen in the room. */
export function keepInvite(id: string, invite: string) {
  const saved = plazas();
  if (saved.rooms[id] && saved.rooms[id].invite !== invite) writePlazas({ ...saved, rooms: { ...saved.rooms, [id]: { ...saved.rooms[id], invite } } });
}
/** This browser is no longer in the room (it may keep the secret to make its successor). */
export function leavePlaza(id: string, forget = true) {
  const saved = plazas(), rooms = { ...saved.rooms };
  if (forget) delete rooms[id];
  writePlazas({ current: saved.current === id ? null : saved.current, rooms });
}

// ── The socket of a seat ──
const RETRY_DELAYS = [500, 1000, 2000, 4000];
const ACTION_TIMEOUT = 12_000;

export interface RoomConnection {
  /** Sends a request of the seat. Resolves once the server did it (its view has arrived by then); rejects with RoomRequestError. */
  send(action: RoomAction, inputAt?: number): Promise<void>;
  presented(revision: number): void;
  close(): void;
}

/**
 * Keeps a socket to the room open for the seat (or, without a token, for a spectator) until `close`: `onView` gets the view now and
 * after every change, `onLink` whether the socket is up (it connects again by itself when it drops),
 * `onGone` is called once when the room or the seat no longer exists.
 */
export function connectRoom(id: string, token: string | null, handlers: { onView: (view: RoomView) => void; onLink: (up: boolean) => void; onGone: (message: string, closed?: boolean) => void }): RoomConnection {
  let socket: WebSocket | null = null, stopped = false, attempt = 0, n = 0;
  let match: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reports: PlayReport[] = [], reportTimer: ReturnType<typeof setTimeout> | undefined;
  const flushReports = () => {
    clearTimeout(reportTimer); reportTimer = undefined;
    const batch = reports.splice(0,8);
    if (batch.length && socket?.readyState === WebSocket.OPEN) {
      try { socket.send(JSON.stringify({type:'performance',reports:batch} satisfies ClientMessage)); } catch { /* Best effort. */ }
    }
    if (reports.length) reportTimer = setTimeout(flushReports,10_000);
  };
  const timing = playTiming(recordPlaySample, report => {
    reports.push(report); if (reports.length > 16) reports.shift();
    if (!reportTimer) reportTimer = setTimeout(flushReports,10_000);
  });
  const waiting = new Map<number, { resolve: () => void; reject: (error: RoomRequestError) => void; timer: ReturnType<typeof setTimeout>; started: number; command: boolean }>();
  const failWaiting = () => {
    timing.disconnect(); reports = []; clearTimeout(reportTimer); reportTimer = undefined;
    for (const { reject, timer } of Array.from(waiting.values())) {
      clearTimeout(timer);
      reject(new RoomRequestError(0, '接続が切れました。盤面の再接続をお待ちください'));
    }
    waiting.clear();
  };
  // While the page is hidden (another app, screen off) the server tells the player of their turn by a push notification.
  let reportsAway = false;
  const reportAway = () => {
    if (!reportsAway || socket?.readyState !== WebSocket.OPEN) return;
    try { socket.send(JSON.stringify({ type: 'away', away: document.hidden } satisfies ClientMessage)); } catch { /* Best effort. */ }
  };
  document.addEventListener('visibilitychange', reportAway);
  function open() {
    if (stopped || !roomServerUrl) return;
    const next = socket = new WebSocket(`${roomServerUrl.replace(/^http/, 'ws')}/rooms/${id}/socket`);
    next.addEventListener('open', () => next.send(JSON.stringify((token === null ? { type: 'hello', watch: true } : { type: 'hello', token }) satisfies ClientMessage)));
    next.addEventListener('message', event => {
      if (stopped || socket !== next) return;
      const message = JSON.parse(String(event.data)) as ServerMessage;
      if (message.type === 'view') {
        if (match !== undefined && match !== message.view.match) timing.disconnect();
        match = message.view.match;
        if (message.view.game) timing.received(message.view.game.revision);
        attempt = 0;
        if (!reportsAway && message.view.reportsAway) { reportsAway = true; reportAway(); }
        handlers.onLink(true);
        handlers.onView(message.view);
      } else if (message.type === 'result') {
        const asked = waiting.get(message.n);
        waiting.delete(message.n);
        if (asked) {
          timing.acknowledged(message.n,message);
          clearTimeout(asked.timer);
          if (asked.command) {
            const name = 'pplale:room-command-roundtrip';
            if (performance.getEntriesByName(name).length >= 128) performance.clearMeasures(name);
            performance.measure(name, { start: asked.started, end: performance.now() });
          }
        }
        if (message.error) asked?.reject(new RoomRequestError(400, message.error));
        else asked?.resolve();
      } else {
        stopped = true;
        failWaiting();
        handlers.onGone(message.error, message.closed);
      }
    });
    next.addEventListener('close', () => {
      if (stopped || socket !== next) return;
      socket = null;
      reportsAway = false;
      failWaiting();
      handlers.onLink(false);
      timer = setTimeout(open, RETRY_DELAYS[Math.min(attempt++, RETRY_DELAYS.length - 1)]);
    });
  }
  open();
  return {
    presented: revision => timing.presented(revision),
    send(action,inputAt) {
      return new Promise((resolve, reject) => {
        if (!socket || socket.readyState !== WebSocket.OPEN) return reject(new RoomRequestError(0, UNREACHABLE));
        const number = ++n;
        const timer = setTimeout(() => {
          // The command may already be committed. Reconnect for its authoritative view; never resend.
          const pending = waiting.get(number);
          if (!pending) return;
          waiting.delete(number);
          timing.failed(number,'timeout');
          pending.reject(new RoomRequestError(0, '応答を確認できませんでした。盤面に再接続しています'));
          socket?.close();
        }, ACTION_TIMEOUT);
        waiting.set(number, { resolve, reject, timer, started: performance.now(), command: action.action === 'command' });
        if (action.action === 'command' && isPlayKind(action.command.type)) timing.begin(number,action.command.type,action.revision+1,inputAt);
        try { socket.send(JSON.stringify({ type: 'action', n: number, action } satisfies ClientMessage)); }
        catch { clearTimeout(timer); waiting.delete(number); timing.failed(number,'disconnected'); reject(new RoomRequestError(0,UNREACHABLE)); }
      });
    },
    close() {
      flushReports(); timing.close(); clearTimeout(reportTimer);
      stopped = true;
      document.removeEventListener('visibilitychange', reportAway);
      if (timer) clearTimeout(timer);
      failWaiting();
      socket?.close();
    },
  };
}
