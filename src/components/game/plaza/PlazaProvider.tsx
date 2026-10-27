'use client';

// The room this player is in (a plaza), kept while they move around the game: its socket lives in
// the game's layout, so opening the cards, a menu or the editor does not leave the room, and coming
// back shows it as it is now. Opening the game comes back to the room this browser was in, or makes
// one; a link enters its room; a room that closed while everyone was away is followed by its
// successor. Entering another room leaves this one only once the other has let the player in.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { TWO_SEAT_ROOM, listedVisibility } from '@pplale/game-core/room';
import type { RoomAction, RoomView, RoomVisibility } from '@pplale/game-core/room';
import { useAuth } from '@/lib/auth';
import { WATCHING_BEAT, publishPresence } from '@/lib/game/social';
import { RoomRequestError, connectRoom, createPlaza, currentPlaza, enterPlaza, keepInvite, keepPlaza, keepSeat, leavePlaza, plazaKey } from '@/lib/game/room/client';
import type { RoomConnection } from '@/lib/game/room/client';
import { guestName, readRoomSettings, saveRoomSettings } from '@/lib/game/plazaSettings';
import { useGameNotifications } from '../notifications/GameNotifications';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
import styles from './Plaza.module.css';

export const plazaHref = (id: string) => `/game/room/${id}/`;
export const isPlazaPath = (path: string | null) => !!path && /^\/game\/room\/\d{6}\/?$/.test(path);

/** Why a room could not be entered. */
export type Refusal = 'hidden' | 'closed' | 'full' | 'offline' | 'error';
type PlazaStage =
  | { kind: 'idle' }
  /**
   * `full`: opening the game or a link (the launch screen); otherwise moving between rooms (a light veil).
   * `notice`: what happened meanwhile (the server is out of reach and is tried again; the room was gone
   * and a new one is being made), shown over whatever is on screen.
   */
  | { kind: 'entering'; to: string | null; full: boolean; notice?: string }
  | { kind: 'in' }
  | { kind: 'refused'; to: string | null; reason: Refusal; message: string };

interface PlazaContextValue {
  stage: PlazaStage;
  /** The room this player is in, its latest view, and whether its socket is up. */
  id: string | null;
  view: RoomView | null;
  linked: boolean;
  /** Opening the game: back to the room this browser is in, or a new one. Resolves with its id. */
  launch(): Promise<string | null>;
  /** Enters a room (by a link: `invite`). Resolves with its id, or null when refused (`stage` says why). */
  enter(id: string, invite?: string | null): Promise<string | null>;
  /** Enters a room and then shows it (from a list or a menu): the current room stays on screen meanwhile. */
  go(id: string): Promise<void>;
  /** A new room of the chosen visibility, leaving this one. */
  create(visibility: RoomVisibility): Promise<string | null>;
  /** Makes a fresh home room from saved settings and shows its table, without the creation tools. */
  newHome(): Promise<string | null>;
  /** Leaves the room for good. */
  leave(): Promise<void>;
  send(action: RoomAction, inputAt?: number): Promise<void>;
  subscribe(listener: (view: RoomView) => void): () => void;
  presented(revision: number): void;
  /** Forgets a refusal (after showing it). */
  settle(): void;
  /** A room that could not be entered: says why for a moment, then back to the player's own room (made if there is none). */
  goHome(notice: string): Promise<void>;
  /** A room id that turned out to be a two-seat room (older rooms and free matches): shown the old way. */
  legacy: string | null;
}

const Context = createContext<PlazaContextValue | null>(null);

/**
 * Friends see a signed-in player in a room they may find (public, friends, friends+), repeated while
 * the page is shown; an invited room is never told. Taken back on leaving it.
 */
function usePresence(inRoom: string | null, listed: string | null) {
  const uid = useAuth().user?.uid;
  useEffect(() => {
    if (!uid || !inRoom) return;
    if (!listed) { void publishPresence(null).catch(() => {}); return; }
    const beat = () => { if (!document.hidden) void publishPresence(listed).catch(() => {}); };
    beat();
    const timer = setInterval(beat, WATCHING_BEAT);
    document.addEventListener('visibilitychange', beat);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', beat); void publishPresence(null).catch(() => {}); };
  }, [uid, inRoom, listed]);
}
export function usePlaza() {
  const value = useContext(Context);
  if (!value) throw new Error('usePlaza outside PlazaProvider');
  return value;
}

/** How long the launch waits for a socket before saying the server cannot be reached (it keeps trying). */
const PATIENCE = 12_000;
/** Out of reach: the same room is tried again, waiting a little longer each time up to this. */
const RETRY_LONGEST = 15_000;
/** How long the player reads that the room was gone before the new one opens. */
const GONE_NOTICE = 2_500;
const OUT_OF_REACH = 'ルームサーバーにつながりません。つなぎ直しています…';
const ROOM_GONE = 'ルームが見つかりませんでした。新しいルームを作ります';
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const UNREACHABLE = 'ルームサーバーにつながりません';
type Opened = { ok: true } | { ok: false; message: string; closed: boolean; offline?: true };
/** Coming back into a room: in it, it closed (a successor may be made), the server cannot be reached, or not let in. */
type Back = { in: string } | { closed: true } | { offline: string } | null;
interface Held { id: string; token: string; socket: RoomConnection }

function refusalOf(failure: unknown): { reason: Refusal; message: string } {
  const message = failure instanceof Error ? failure.message : 'ルームに入れませんでした';
  if (!(failure instanceof RoomRequestError)) return { reason: 'error', message };
  return { reason: failure.status === 0 ? 'offline' : failure.status === 404 ? 'hidden' : failure.status === 410 ? 'closed' : failure.status === 409 ? 'full' : 'error', message };
}

export function PlazaProvider({ children }: { children: ReactNode }) {
  const router = useRouter(), pathname = usePathname();
  const { notify } = useGameNotifications();
  const [stage, setStage] = useState<PlazaStage>({ kind: 'idle' });
  const [view, setView] = useState<RoomView | null>(null);
  const [id, setId] = useState<string | null>(null);
  const [linked, setLinked] = useState(true);
  const [legacy, setLegacy] = useState<string | null>(null);
  const held = useRef<Held | null>(null);
  const version = useRef(0);
  const listeners = useRef(new Set<(view: RoomView) => void>());
  /** Sockets being left on purpose: their goodbye is not a lost room. */
  const leaving = useRef(new WeakSet<RoomConnection>());
  /** One move at a time (React's development mode also runs effects twice). */
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const path = useRef(pathname);
  useEffect(() => { path.current = pathname; }, [pathname]);
  const serial = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const next = queue.current.then(task, task);
    queue.current = next.catch(() => {});
    return next;
  }, []);

  const take = useCallback((socket: RoomConnection, next: RoomView) => {
    if (held.current?.socket !== socket || next.version <= version.current) return;
    version.current = next.version;
    if (next.plaza?.invite) keepInvite(next.id, next.plaza.invite);
    // The same chimes as before a match of two: someone sat down across, and the match began.
    const across = next.watching ? null : next.players[next.seat === 0 ? 1 : 0];
    if (next.status === 'lobby' && across?.member) notify('matched', `${next.id}:${across.member}:${next.match + 1}`);
    if (next.status === 'playing' && !next.watching) notify('started', `${next.id}:${next.match}`);
    setView(next);
    listeners.current.forEach(listener => listener(next));
  }, [notify]);

  /** Leaves a room for good (after another one let the player in, or on purpose). */
  const quit = useCallback(async (old: Held) => {
    leaving.current.add(old.socket);
    await old.socket.send({ action: 'leave' }).catch(() => {});
    old.socket.close();
    leavePlaza(old.id);
  }, []);

  /** The socket's first view arrived: this is the player's room now. */
  const adopt = useCallback((next: Held) => {
    const old = held.current;
    held.current = next;
    version.current = 0;
    setId(next.id);
    setLinked(true);
    setStage({ kind: 'in' });
    keepPlaza(next.id, { token: next.token });
    if (old && old.id !== next.id) void quit(old);
    else if (old && old.socket !== next.socket) { leaving.current.add(old.socket); old.socket.close(); }
  }, [quit]);

  // `lost` and `open` call each other (a lost room is entered again); the ref breaks the cycle.
  const lostRef = useRef<(room: Held, message: string, closed: boolean) => void>(() => {});
  /** Opens the room's socket. Resolves once its first view came (the room is then the player's), or with why not. */
  const open = useCallback((roomId: string, token: string) => new Promise<Opened>(resolve => {
    let settled = false;
    const socket: RoomConnection = connectRoom(roomId, token, {
      onView(next) {
        if (!settled) { settled = true; clearTimeout(timer); adopt({ id: roomId, token, socket }); resolve({ ok: true }); }
        take(socket, next);
      },
      onLink(up) { if (held.current?.socket === socket) setLinked(up); },
      onGone(message, closed) {
        if (!settled) { settled = true; clearTimeout(timer); socket.close(); return resolve({ ok: false, message, closed: !!closed }); }
        if (held.current?.socket === socket && !leaving.current.has(socket)) lostRef.current({ id: roomId, token, socket }, message, !!closed);
      },
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.close();
      resolve({ ok: false, message: UNREACHABLE, closed: false, offline: true });
    }, PATIENCE);
  }), [adopt, take]);

  /** Moves to the room's page when the player is looking at a room. */
  const show = useCallback((roomId: string) => {
    if (isPlazaPath(path.current) && path.current !== plazaHref(roomId)) router.replace(plazaHref(roomId));
  }, [router]);

  const settle = useCallback((roomId: string | null, failure: unknown) => {
    setStage({ kind: 'refused', to: roomId, ...refusalOf(failure) });
    return null;
  }, []);

  /** A new room of the player's settings (or the successor of a closed one: `from`). */
  const make = useCallback(async (from?: { id: string; token: string }, chosen?: RoomVisibility) => {
    const settings = readRoomSettings(), visibility = chosen ?? settings.homeVisibility;
    try {
      const entered = await createPlaza(settings.rules, guestName(), { name: '', visibility, ...(from && { from }) });
      if (from) leavePlaza(from.id);
      // The room becomes this browser's current one once its socket is up (`adopt`).
      keepPlaza(entered.view.id, { token: entered.token, ...(entered.view.plaza?.invite && { invite: entered.view.plaza.invite }) }, false);
      const opened = await open(entered.view.id, entered.token);
      if (!opened.ok) return settle(entered.view.id, new RoomRequestError(opened.offline ? 0 : 500, opened.message));
      return entered.view.id;
    } catch (failure) { return settle(null, failure); }
  }, [open, settle]);

  /** Back into a room this browser has a secret of. */
  const resume = useCallback(async (roomId: string, token: string, invite?: string): Promise<Back> => {
    const opened = await open(roomId, token);
    if (opened.ok) return { in: roomId };
    if (opened.offline) return { offline: opened.message };
    if (opened.closed) return { closed: true };
    // Away for longer than the room waits: come back in as a new member (without the owner's role).
    try {
      const entered = await enterPlaza(roomId, guestName(), { rejoin: token, invite });
      keepPlaza(roomId, { token: entered.token }, false);
      return (await open(roomId, entered.token)).ok ? { in: roomId } : null;
    } catch (failure) { return failure instanceof RoomRequestError && failure.status === 0 ? { offline: failure.message } : null; }
  }, [open]);

  /**
   * Back into the room, however long the server is out of reach: it is tried again (the notice says
   * so) until it answers. Resolves with whether the room is still there for this player.
   */
  const reconnect = useCallback(async (roomId: string, token: string, invite: string | undefined, full: boolean): Promise<Back> => {
    for (let wait = 2_000; ; wait = Math.min(wait * 2, RETRY_LONGEST)) {
      const back = await resume(roomId, token, invite);
      if (!back || !('offline' in back)) return back;
      setStage({ kind: 'entering', to: roomId, full, notice: OUT_OF_REACH });
      await pause(wait);
    }
  }, [resume]);
  /** The room was gone (the server forgot it, or it expired): said, then a new room of the player's settings. */
  const remake = useCallback(async (roomId: string | null, full: boolean) => {
    if (roomId) leavePlaza(roomId);
    setStage({ kind: 'entering', to: null, full, notice: ROOM_GONE });
    await pause(GONE_NOTICE);
    return make();
  }, [make]);

  const lost = useCallback((room: Held, _message: string, closed: boolean) => void serial(async () => {
    if (held.current?.socket !== room.socket) return;
    held.current = null;
    setView(null);
    setId(null);
    // Another tab of this browser went to another room: follow it.
    const saved = currentPlaza();
    if (saved && saved.id !== room.id) {
      setStage({ kind: 'entering', to: saved.id, full: false });
      const followed = await resume(saved.id, saved.token, saved.invite);
      if (followed && 'in' in followed) return show(followed.in);
    }
    // Everyone was away and the room closed: its successor, behind the launch screen. Otherwise the
    // same room again, as long as it takes the server to answer.
    setStage({ kind: 'entering', to: closed ? null : room.id, full: closed });
    const back = closed ? { closed: true as const } : await reconnect(room.id, room.token, plazaKey(room.id)?.invite, false);
    if (back && 'in' in back) return show(back.in);
    const next = back && 'closed' in back ? await make({ id: room.id, token: room.token }) : await remake(room.id, false);
    // A room that could not be made says why itself (its refusal).
    if (next) show(next);
  }), [make, reconnect, remake, resume, serial, show]);
  useEffect(() => { lostRef.current = lost; }, [lost]);

  const launch = useCallback(() => serial(async () => {
    if (held.current) return held.current.id;
    setStage({ kind: 'entering', to: null, full: true });
    const once = async () => {
      // Another tab of this browser may have just made the room: it is used here too.
      const saved = currentPlaza();
      if (saved) {
        const back = await reconnect(saved.id, saved.token, saved.invite, true);
        if (back && 'in' in back) return back.in;
        if (back && 'closed' in back) return make({ id: saved.id, token: saved.token });
        // The room this browser was in is gone: said, then a new one.
        return remake(saved.id, true);
      }
      return make();
    };
    return typeof navigator !== 'undefined' && navigator.locks ? navigator.locks.request('pplale-plaza-launch', once) : once();
  }), [make, reconnect, remake, serial]);

  const enter = useCallback((roomId: string, invite?: string | null) => serial(async () => {
    if (held.current?.id === roomId) { setStage({ kind: 'in' }); return roomId; }
    const previous = !!held.current;
    setStage({ kind: 'entering', to: roomId, full: !previous });
    const key = plazaKey(roomId);
    if (key) {
      const back = await resume(roomId, key.token, invite ?? key.invite);
      if (back && 'in' in back) return back.in;
      if (back && 'offline' in back) return settle(roomId, new RoomRequestError(0, back.offline));
      if (back) {
        // The room closed: the one this browser was in is followed by its successor; any other is just gone.
        if (currentPlaza()?.id === roomId) return make({ id: roomId, token: key.token });
        return settle(roomId, new RoomRequestError(410, 'このルームは閉じました'));
      }
    }
    try {
      const entered = await enterPlaza(roomId, guestName(), { invite: invite ?? key?.invite });
      // A two-seat room (from before rooms were places, or a link to one): its seat is kept the old way.
      if (!entered.view.plaza) {
        keepSeat(roomId, { seat: entered.view.seat, token: entered.token });
        setLegacy(roomId);
        setStage(held.current ? { kind: 'in' } : { kind: 'idle' });
        return null;
      }
      keepPlaza(roomId, { token: entered.token, ...(invite && { invite }) }, false);
      const opened = await open(roomId, entered.token);
      if (!opened.ok) return settle(roomId, new RoomRequestError(opened.offline ? 0 : 404, opened.message));
      return roomId;
    } catch (failure) {
      // A two-seat room: shown the old way, its lobby, where sitting down is the visitor's choice.
      if (failure instanceof RoomRequestError && failure.message === TWO_SEAT_ROOM) {
        setLegacy(roomId);
        setStage(held.current ? { kind: 'in' } : { kind: 'idle' });
        return null;
      }
      return settle(roomId, failure);
    }
  }), [make, open, resume, serial, settle]);

  const go = useCallback(async (roomId: string) => {
    await enter(roomId);
    // Let in: its table. Refused: its page says why (and offers the way back).
    router.push(plazaHref(roomId));
  }, [enter, router]);

  const create = useCallback((visibility: RoomVisibility) => serial(async () => {
    setStage({ kind: 'entering', to: null, full: !held.current });
    const made = await make(undefined, visibility);
    if (made) router.push(`${plazaHref(made)}?created=1`);
    return made;
  }), [make, router, serial]);

  const newHome = useCallback(() => serial(async () => {
    setStage({ kind: 'entering', to: null, full: !held.current });
    const made = await make();
    if (made) router.push(plazaHref(made));
    return made;
  }), [make, router, serial]);

  const leave = useCallback(() => serial(async () => {
    const old = held.current;
    held.current = null;
    setView(null);
    setId(null);
    setStage({ kind: 'idle' });
    if (old) await quit(old);
  }), [quit, serial]);

  const send = useCallback((action: RoomAction, inputAt?: number) =>
    held.current?.socket.send(action, inputAt) ?? Promise.reject(new RoomRequestError(0, 'ルームに入っていません')), []);
  const subscribe = useCallback((listener: (view: RoomView) => void) => {
    listeners.current.add(listener);
    return () => { listeners.current.delete(listener); };
  }, []);
  const presented = useCallback((revision: number) => held.current?.socket.presented(revision), []);
  const settleStage = useCallback(() => setStage(held.current ? { kind: 'in' } : { kind: 'idle' }), []);
  const goHome = useCallback(async (notice: string) => {
    setStage({ kind: 'entering', to: null, full: !held.current, notice });
    await pause(GONE_NOTICE);
    const home = await launch();
    if (!home) return;
    setStage({ kind: 'in' });
    router.replace(plazaHref(home));
  }, [launch, router]);

  usePresence(id, view?.plaza && listedVisibility(view.plaza.visibility) ? view.id : null);

  // The rules the owner sets become the rules of the rooms this player makes next.
  const rulesKey = view?.plaza && view.plaza.owner === view.plaza.me ? JSON.stringify(view.plaza.nextRules ?? view.rules) : null;
  useEffect(() => { if (rulesKey) saveRoomSettings({ rules: JSON.parse(rulesKey) }); }, [rulesKey]);

  const value = useMemo<PlazaContextValue>(() => ({ stage, id, view, linked, launch, enter, go, create, newHome, leave, send, subscribe, presented, settle: settleStage, goHome, legacy }),
    [stage, id, view, linked, launch, enter, go, create, newHome, leave, send, subscribe, presented, settleStage, goHome, legacy]);
  return <Context.Provider value={value}>
    {children}
    {/* Moving between rooms: the current one stays on screen under a small sign. */}
    {stage.kind === 'entering' && (!stage.full || stage.notice) && <div className={styles.veil} role="status" aria-live="polite"><OrnateFrame as="span" size="sm" className={styles.veilSign}><span className={styles.veilDots} aria-hidden="true"><span /><span /><span /></span>{stage.notice ?? (stage.to ? 'ルームへ移動中' : 'ルームを準備中')}</OrnateFrame></div>}
  </Context.Provider>;
}
