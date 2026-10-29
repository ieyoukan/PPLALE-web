'use client';

// 入室・復帰・ルーム移動と接続を管理する。画面切り替えでは接続を切らず、移動先への入室が成功してから元のルームを退出する。
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { TWO_SEAT_ROOM, listedVisibility } from '@pplale/game-core/room';
import type { RoomAction, RoomChatMessage, RoomView, RoomVisibility } from '@pplale/game-core/room';
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

/** 入室できなかった理由。 */
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
  /** 現在のルームID・表示状態・接続状態。 */
  id: string | null;
  view: RoomView | null;
  linked: boolean;
  chat: RoomChatMessage[];
  /** 起動時に元のルームへ戻るか、新しく作る。成功したルームIDを返す。 */
  launch(): Promise<string | null>;
  /** 指定したルームへ入る。成功時はID、拒否時はnullを返し、理由をstageへ反映する。 */
  enter(id: string, invite?: string | null): Promise<string | null>;
  /** 一覧などから入室して画面を移す。入室するまでは元のルームを残す。 */
  go(id: string): Promise<void>;
  /** 指定した公開範囲で新規作成し、元のルームから移動する。 */
  create(visibility: RoomVisibility): Promise<string | null>;
  /** 設定済みの公開範囲でホームルームを新しく作り、準備画面へ移る。 */
  newHome(): Promise<string | null>;
  /** ルームから退出する。 */
  leave(): Promise<void>;
  send(action: RoomAction, inputAt?: number): Promise<void>;
  subscribe(listener: (view: RoomView) => void): () => void;
  presented(revision: number): void;
  /** 入室拒否の表示を閉じる。 */
  settle(): void;
  /** 入室できなかった理由を伝えてから、自分のルームへ戻る。必要なら新規作成する。 */
  goHome(notice: string): Promise<void>;
  /** 互換表示する旧2席ルームのID。 */
  legacy: string | null;
}

const Context = createContext<PlazaContextValue | null>(null);

/** 発見可能な公開範囲の在室情報だけをフレンドへ知らせる。非公開ルームは公開せず、退出時に取り下げる。 */
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

/** 接続待ちをオフライン表示へ切り替えるまでの時間。接続の再試行は続ける。 */
const PATIENCE = 12_000;
/** 接続できないときの最大再試行間隔。 */
const RETRY_LONGEST = 15_000;
/** 入室できない理由を表示してからホームへ戻るまでの時間。 */
const GONE_NOTICE = 2_500;
const OUT_OF_REACH = 'ルームサーバーにつながりません。つなぎ直しています…';
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const UNREACHABLE = 'ルームサーバーにつながりません';
type Opened = { ok: true } | { ok: false; message: string; closed: boolean; offline?: true };
/** 復帰の結果。元のルーム・閉鎖・通信失敗・入室不可を区別する。 */
type Back = { in: string } | { closed: true } | { offline: string } | null;
interface Held { id: string; token: string; socket: RoomConnection }

function refusalOf(failure: unknown): { reason: Refusal; message: string } {
  const message = failure instanceof Error ? failure.message : 'ルームに入れませんでした';
  if (!(failure instanceof RoomRequestError)) return { reason: 'error', message };
  const reasons: Record<number, Refusal> = { 0: 'offline', 404: 'hidden', 410: 'closed', 409: 'full' };
  return { reason: reasons[failure.status] ?? 'error', message };
}

export function PlazaProvider({ children }: { children: ReactNode }) {
  const router = useRouter(), pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
  const { notify } = useGameNotifications();
  const [stage, setStage] = useState<PlazaStage>({ kind: 'idle' });
  const [view, setView] = useState<RoomView | null>(null);
  const [id, setId] = useState<string | null>(null);
  const [linked, setLinked] = useState(true);
  const [legacy, setLegacy] = useState<string | null>(null);
  const [chat, setChat] = useState<RoomChatMessage[]>([]);
  const chatVersion = useRef(0);
  const activeConnectionRef = useRef<Held | null>(null);
  const version = useRef(0);
  const listeners = useRef(new Set<(view: RoomView) => void>());
  /** 意図的に閉じる接続。退出を通信断として扱わないために記録する。 */
  const leaving = useRef(new WeakSet<RoomConnection>());
  /** 入退室は直列に処理する。Strict Modeなどで同時に呼ばれても順序を崩さない。 */
  const roomChangeQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const currentPathRef = useRef(pathname);
  useEffect(() => { currentPathRef.current = pathname; }, [pathname]);
  const serializeRoomChange = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const next = roomChangeQueueRef.current.then(task, task);
    roomChangeQueueRef.current = next.catch(() => {});
    return next;
  }, []);

  const receiveChatMessages = useCallback((messages: RoomChatMessage[], revision: number) => {
    if (revision <= chatVersion.current) return;
    chatVersion.current = revision;
    setChat(previous => previous.length === messages.length && previous.every((message, index) => message.id === messages[index].id && message.name === messages[index].name) ? previous : messages);
  }, []);
  const receiveRoomView = useCallback((socket: RoomConnection, next: RoomView) => {
    if (activeConnectionRef.current?.socket !== socket || next.version <= version.current) return;
    version.current = next.version;
    if (next.plaza?.chat) receiveChatMessages(next.plaza.chat, next.version);
    if (next.plaza?.invite) keepInvite(next.id, next.plaza.invite);
    // 相手の着席と試合開始には、共通の通知音を使う。
    const across = next.watching ? null : next.players[next.seat === 0 ? 1 : 0];
    if (next.status === 'lobby' && across?.member) notify('matched', `${next.id}:${across.member}:${next.match + 1}`);
    if (next.status === 'playing' && !next.watching) notify('started', `${next.id}:${next.match}`);
    setView(next);
    listeners.current.forEach(listener => listener(next));
  }, [notify, receiveChatMessages]);

  /** 移動先に入れた後、または明示操作によって元のルームを退出する。 */
  const leaveConnection = useCallback(async (old: Held) => {
    leaving.current.add(old.socket);
    await old.socket.send({ action: 'leave' }).catch(() => {});
    old.socket.close();
    leavePlaza(old.id);
  }, []);

  /** 初回の表示を受け取った時点で、このルームを現在地として確定する。 */
  const activateRoom = useCallback((next: Held) => {
    const old = activeConnectionRef.current;
    activeConnectionRef.current = next;
    version.current = 0;
    chatVersion.current = 0; setChat([]);
    setId(next.id);
    setLinked(true);
    setStage({ kind: 'in' });
    keepPlaza(next.id, { token: next.token });
    if (old && old.id !== next.id) void leaveConnection(old);
    else if (old && old.socket !== next.socket) { leaving.current.add(old.socket); old.socket.close(); }
  }, [leaveConnection]);

  // 切断と再接続の相互呼び出しをrefでつなぎ、コールバックの依存循環を避ける。
  const handleLostConnectionRef = useRef<(room: Held, message: string, closed: boolean) => void>(() => {});
  /** 初回の表示を受信したら成功する。受信できなければ拒否・閉鎖・通信失敗の理由を返す。 */
  const connectToRoom = useCallback((roomId: string, token: string) => new Promise<Opened>(resolve => {
    let settled = false;
    const socket: RoomConnection = connectRoom(roomId, token, {
      onView(next) {
        if (!settled) { settled = true; clearTimeout(timer); activateRoom({ id: roomId, token, socket }); resolve({ ok: true }); }
        receiveRoomView(socket, next);
      },
      onLink(up) { if (activeConnectionRef.current?.socket === socket) setLinked(up); },
      onChat(message) { if (activeConnectionRef.current?.socket === socket && message.id === roomId) receiveChatMessages(message.messages, message.version); },
      onGone(message, closed) {
        if (!settled) { settled = true; clearTimeout(timer); socket.close(); return resolve({ ok: false, message, closed: !!closed }); }
        if (activeConnectionRef.current?.socket === socket && !leaving.current.has(socket)) handleLostConnectionRef.current({ id: roomId, token, socket }, message, !!closed);
      },
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.close();
      resolve({ ok: false, message: UNREACHABLE, closed: false, offline: true });
    }, PATIENCE);
  }), [activateRoom, receiveRoomView, receiveChatMessages]);

  /** ルーム画面を見ている場合だけ、指定ルームのURLへ移す。 */
  const showRoom = useCallback((roomId: string) => {
    if (isPlazaPath(currentPathRef.current) && currentPathRef.current !== plazaHref(roomId)) router.replace(plazaHref(roomId));
  }, [router]);

  const settle = useCallback((roomId: string | null, failure: unknown) => {
    setStage({ kind: 'refused', to: roomId, ...refusalOf(failure) });
    return null;
  }, []);

  /** 設定したルームを新規作成する。from指定時は閉じたルームを引き継ぐ。 */
  const createRoom = useCallback(async (from?: { id: string; token: string }, chosen?: RoomVisibility) => {
    const settings = readRoomSettings(), visibility = chosen ?? settings.homeVisibility;
    try {
      const entered = await createPlaza(settings.rules, guestName(), { name: '', visibility, ...(from && { from }) });
      if (from) leavePlaza(from.id);
      // 接続後にactivateRoomで確定するまでは、作成先を現在地にしない。
      keepPlaza(entered.view.id, { token: entered.token, ...(entered.view.plaza?.invite && { invite: entered.view.plaza.invite }) }, false);
      const opened = await connectToRoom(entered.view.id, entered.token);
      if (!opened.ok) return settle(entered.view.id, new RoomRequestError(opened.offline ? 0 : opened.closed ? 410 : 500, opened.message));
      return entered.view.id;
    } catch (failure) { return settle(null, failure); }
  }, [connectToRoom, settle]);

  /** 保存したトークンで元のルームへ復帰する。 */
  const resumeRoom = useCallback(async (roomId: string, token: string, invite?: string): Promise<Back> => {
    const opened = await connectToRoom(roomId, token);
    if (opened.ok) return { in: roomId };
    // ブラウザはWebSocket接続時のHTTP 410も、一般的な接続失敗として扱う。
    // HTTPで再入室を確認し、閉鎖と一時的な接続失敗を区別する。
    if (opened.closed) return { closed: true };
    // メンバーが失効した場合は入室し直す。証明が合い、未引き継ぎならオーナーも復元する。
    try {
      const entered = await enterPlaza(roomId, guestName(), { rejoin: token, invite });
      keepPlaza(roomId, { token: entered.token }, false);
      const resumed = await connectToRoom(roomId, entered.token);
      if (resumed.ok) return { in: roomId };
      if (resumed.closed) return { closed: true };
      if (resumed.offline) return { offline: resumed.message };
      return null;
    } catch (failure) {
      if (failure instanceof RoomRequestError) {
        if (failure.status === 410) return { closed: true };
        if (failure.status === 0) return { offline: failure.message };
      }
      return null;
    }
  }, [connectToRoom]);

  /** 通信できるまで同じルームを再試行する。閉鎖・入室不可が分かれば打ち切る。 */
  const retryRoomConnection = useCallback(async (roomId: string, token: string, invite: string | undefined, full: boolean): Promise<Back> => {
    for (let wait = 2_000; ; wait = Math.min(wait * 2, RETRY_LONGEST)) {
      const back = await resumeRoom(roomId, token, invite);
      if (!back || !('offline' in back)) return back;
      setStage({ kind: 'entering', to: roomId, full, notice: OUT_OF_REACH });
      await pause(wait);
    }
  }, [resumeRoom]);
  /** 元のルームが消えた場合は、現在の設定で新しいルームを作る。 */
  const createHomeReplacement = useCallback(async (roomId: string | null, full: boolean) => {
    if (roomId) leavePlaza(roomId);
    setStage({ kind: 'entering', to: null, full });
    return createRoom();
  }, [createRoom]);

  const handleLostConnection = useCallback((room: Held, _message: string, closed: boolean) => void serializeRoomChange(async () => {
    if (activeConnectionRef.current?.socket !== room.socket) return;
    activeConnectionRef.current = null;
    setView(null);
    setId(null);
    // 同じブラウザの別タブが移動済みなら、そのルームへ追従する。
    const saved = currentPlaza();
    if (saved && saved.id !== room.id) {
      setStage({ kind: 'entering', to: saved.id, full: false });
      const followed = await resumeRoom(saved.id, saved.token, saved.invite);
      if (followed && 'in' in followed) return showRoom(followed.in);
    }
    // 全員不在で閉じた場合は、起動画面を通して後継ルームへ移る。
    // 一時切断の場合は、元のルームへ再接続する。
    setStage({ kind: 'entering', to: closed ? null : room.id, full: closed });
    const back = closed ? { closed: true as const } : await retryRoomConnection(room.id, room.token, plazaKey(room.id)?.invite, false);
    if (back && 'in' in back) return showRoom(back.in);
    const next = back && 'closed' in back ? await createRoom({ id: room.id, token: room.token }) : await createHomeReplacement(room.id, false);
    // 作成に失敗した理由はcreateRoom側で表示する。
    if (next) showRoom(next);
  }), [createRoom, retryRoomConnection, createHomeReplacement, resumeRoom, serializeRoomChange, showRoom]);
  useEffect(() => { handleLostConnectionRef.current = handleLostConnection; }, [handleLostConnection]);

  const launch = useCallback(() => serializeRoomChange(async () => {
    if (activeConnectionRef.current) return activeConnectionRef.current.id;
    setStage({ kind: 'entering', to: null, full: true });
    const once = async () => {
      // 別タブが作成したルームがあれば、重複作成せず同じルームを使う。
      const saved = currentPlaza();
      if (saved) {
        const back = await retryRoomConnection(saved.id, saved.token, saved.invite, true);
        if (back && 'in' in back) return back.in;
        if (back && 'closed' in back) return createRoom({ id: saved.id, token: saved.token });
        // 期限切れのホームは通常の起動として作り直し、追加の案内や待ち時間は挟まない。
        return createHomeReplacement(saved.id, true);
      }
      return createRoom();
    };
    return typeof navigator !== 'undefined' && navigator.locks ? navigator.locks.request('pplale-plaza-launch', once) : once();
  }), [createRoom, retryRoomConnection, createHomeReplacement, serializeRoomChange]);

  const enter = useCallback((roomId: string, invite?: string | null) => serializeRoomChange(async () => {
    if (activeConnectionRef.current?.id === roomId) { setStage({ kind: 'in' }); return roomId; }
    const previous = !!activeConnectionRef.current;
    setStage({ kind: 'entering', to: roomId, full: !previous });
    const key = plazaKey(roomId);
    if (key) {
      const back = await resumeRoom(roomId, key.token, invite ?? key.invite);
      if (back && 'in' in back) return back.in;
      if (back && 'offline' in back) return settle(roomId, new RoomRequestError(0, back.offline));
      if (back) {
        // 閉じたルームが元の現在地なら後継を作る。訪問先なら閉鎖として扱う。
        if (currentPlaza()?.id === roomId) return createRoom({ id: roomId, token: key.token });
        return settle(roomId, new RoomRequestError(410, 'このルームは閉じました'));
      }
    }
    try {
      const entered = await enterPlaza(roomId, guestName(), { invite: invite ?? key?.invite });
      // 旧2席ルームでは、在室トークンの代わりに座席情報を保存する。
      if (!entered.view.plaza) {
        keepSeat(roomId, { seat: entered.view.seat, token: entered.token });
        setLegacy(roomId);
        setStage(activeConnectionRef.current ? { kind: 'in' } : { kind: 'idle' });
        return null;
      }
      keepPlaza(roomId, { token: entered.token, ...(invite && { invite }) }, false);
      const opened = await connectToRoom(roomId, entered.token);
      if (!opened.ok) return settle(roomId, new RoomRequestError(opened.offline ? 0 : opened.closed ? 410 : 404, opened.message));
      return roomId;
    } catch (failure) {
      // 旧2席ルームの互換表示。入室・着席は準備画面で本人に選んでもらう。
      if (failure instanceof RoomRequestError && failure.message === TWO_SEAT_ROOM) {
        setLegacy(roomId);
        setStage(activeConnectionRef.current ? { kind: 'in' } : { kind: 'idle' });
        return null;
      }
      return settle(roomId, failure);
    }
  }), [createRoom, connectToRoom, resumeRoom, serializeRoomChange, settle]);

  const go = useCallback(async (roomId: string) => {
    const entered = await enter(roomId);
    // 閉じた現在地から後継へ入った場合、共有リンクとは別のIDへ移動する。
    router.push(plazaHref(entered ?? roomId));
  }, [enter, router]);

  const create = useCallback((visibility: RoomVisibility) => serializeRoomChange(async () => {
    setStage({ kind: 'entering', to: null, full: !activeConnectionRef.current });
    const made = await createRoom(undefined, visibility);
    if (made) router.push(`${plazaHref(made)}?created=1`);
    return made;
  }), [createRoom, router, serializeRoomChange]);

  const newHome = useCallback(() => serializeRoomChange(async () => {
    setStage({ kind: 'entering', to: null, full: !activeConnectionRef.current });
    const made = await createRoom();
    if (made) router.push(plazaHref(made));
    return made;
  }), [createRoom, router, serializeRoomChange]);

  const leave = useCallback(() => serializeRoomChange(async () => {
    const old = activeConnectionRef.current;
    activeConnectionRef.current = null;
    setView(null);
    setId(null);
    setStage({ kind: 'idle' });
    if (old) await leaveConnection(old);
  }), [leaveConnection, serializeRoomChange]);

  // メンバートークンと、現在のFirebaseアカウントは別の識別情報。
  // ログアウトやアカウント変更後に、前の参加者の権限・表示を引き継がせない。
  const member = view?.plaza?.members.find(person => person.id === view.plaza?.me);
  const identityMismatch = !authLoading && !!member && (member.profileId ?? null) !== (user?.uid ?? null);
  const changingIdentity = useRef(false);
  useEffect(() => {
    if (!identityMismatch || changingIdentity.current) return;
    changingIdentity.current = true;
    void serializeRoomChange(async () => {
      const old = activeConnectionRef.current;
      if (!old) return;
      const invite = plazaKey(old.id)?.invite;
      leaving.current.add(old.socket);
      activeConnectionRef.current = null;
      setView(null); setId(null);
      setStage({ kind: 'entering', to: old.id, full: true });
      await leaveConnection(old);
      try {
        // 入室権限を再確認し、ゲストへ前のアカウントのフレンド権限を渡さない。
        const entered = await enterPlaza(old.id, guestName(), { invite });
        keepPlaza(old.id, { token: entered.token, ...(invite && { invite }) }, false);
        const opened = await connectToRoom(old.id, entered.token);
        if (!opened.ok) throw new RoomRequestError(opened.offline ? 0 : opened.closed ? 410 : 404, opened.message);
      } catch (failure) {
        if (failure instanceof RoomRequestError && failure.status === 0) {
          settle(old.id, failure);
          return;
        }
        // 空室・閉鎖なら作り直し、新しい本人が入れないルームの情報は公開しない。
        const home = await createRoom();
        if (home) showRoom(home);
      }
    }).finally(() => { changingIdentity.current = false; });
  }, [identityMismatch, user?.uid, member?.id, serializeRoomChange, leaveConnection, connectToRoom, createRoom, settle, showRoom]);

  const send = useCallback((action: RoomAction, inputAt?: number) =>
    !identityMismatch && activeConnectionRef.current ? activeConnectionRef.current.socket.send(action, inputAt) : Promise.reject(new RoomRequestError(0, 'ルームに入っていません')), [identityMismatch]);
  const subscribe = useCallback((listener: (view: RoomView) => void) => {
    listeners.current.add(listener);
    return () => { listeners.current.delete(listener); };
  }, []);
  const presented = useCallback((revision: number) => activeConnectionRef.current?.socket.presented(revision), []);
  const settleStage = useCallback(() => setStage(activeConnectionRef.current ? { kind: 'in' } : { kind: 'idle' }), []);
  const goHome = useCallback(async (notice: string) => {
    setStage({ kind: 'entering', to: null, full: !activeConnectionRef.current, notice });
    await pause(GONE_NOTICE);
    const home = await launch();
    if (!home) return;
    setStage({ kind: 'in' });
    router.replace(plazaHref(home));
  }, [launch, router]);

  usePresence(identityMismatch ? null : id, !identityMismatch && view?.plaza && listedVisibility(view.plaza.visibility) ? view.id : null);

  // オーナーが変更したルールを、次のルーム作成時の設定にも反映する。
  const rulesKey = view?.plaza && view.plaza.owner === view.plaza.me ? JSON.stringify(view.plaza.nextRules ?? view.rules) : null;
  useEffect(() => { if (rulesKey) saveRoomSettings({ rules: JSON.parse(rulesKey) }); }, [rulesKey]);

  const value = useMemo<PlazaContextValue>(() => ({ stage, id, view: identityMismatch ? null : view, linked, chat: identityMismatch ? [] : chat, launch, enter, go, create, newHome, leave, send, subscribe, presented, settle: settleStage, goHome, legacy }),
    [stage, id, view, identityMismatch, linked, chat, launch, enter, go, create, newHome, leave, send, subscribe, presented, settleStage, goHome, legacy]);
  return <Context.Provider value={value}>
    {children}
    {/* Moving between rooms: the current one stays on screen under a small sign. */}
    {stage.kind === 'entering' && (!stage.full || stage.notice) && <div className={styles.veil} role="status" aria-live="polite"><OrnateFrame as="span" size="sm" className={styles.veilSign}><span className={styles.veilDots} aria-hidden="true"><span /><span /><span /></span>{stage.notice ?? 'ルームに接続中'}</OrnateFrame></div>}
  </Context.Provider>;
}
