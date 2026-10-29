import { RoomRequestError, roomServerUrl, UNREACHABLE } from './request';
import { playTiming } from './playTiming';
import { recordPlaySample } from './performanceLog';
import { isPlayKind } from '@pplale/game-core/performance';
import type { PlayReport } from '@pplale/game-core/performance';
import type { ClientMessage, RoomAction, RoomView, ServerMessage } from '@pplale/game-core/room';

// 対戦・チャットのWebSocket接続。受信、再接続、送信の応答待ちを管理する。
const RETRY_DELAYS = [500, 1000, 2000, 4000];
const ACTION_TIMEOUT = 12_000;

export interface RoomConnectionHandlers {
  onView: (view: RoomView) => void;
  onLink: (connected: boolean) => void;
  onGone: (message: string, closed?: boolean) => void;
  onChat?: (message: Extract<ServerMessage, { type: 'chat' }>) => void;
}

export interface RoomConnection {
  /** 操作の反映と表示状態の受信後に完了する。失敗時はRoomRequestErrorで拒否する。 */
  send(action: RoomAction, inputAt?: number): Promise<void>;
  presented(revision: number): void;
  close(): void;
}

/** closeまで接続を維持する。onViewは表示更新、onLinkは接続状態、onGoneはルーム・席が消えた場合の通知。トークンなしでは観戦接続にする。 */
export function connectRoom(id: string, token: string | null, handlers: RoomConnectionHandlers): RoomConnection {
  let socket: WebSocket | null = null, stopped = false, attempt = 0, requestSequence = 0;
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
  // 非表示中も自分の番を通知できるよう、表示状態をサーバーへ知らせる。
  let reportsAway = false;
  const reportAway = () => {
    if (!reportsAway || socket?.readyState !== WebSocket.OPEN) return;
    try { socket.send(JSON.stringify({ type: 'away', away: document.hidden } satisfies ClientMessage)); } catch { /* Best effort. */ }
  };
  document.addEventListener('visibilitychange', reportAway);
  function open() {
    if (stopped || !roomServerUrl) return;
    const next = socket = new WebSocket(`${roomServerUrl.replace(/^http/, 'ws')}/rooms/${id}/socket`);
    next.addEventListener('open', () => next.send(JSON.stringify({ ...(token === null ? { type: 'hello' as const, watch: true as const } : { type: 'hello' as const, token }), ...(handlers.onChat && { chat: true as const }) } satisfies ClientMessage)));
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
      } else if (message.type === 'chat') {
        handlers.onChat?.(message);
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
    next.addEventListener('close', event => {
      if (stopped || socket !== next) return;
      socket = null;
      reportsAway = false;
      failWaiting();
      handlers.onLink(false);
      // gone通知が届かず、終了コードだけでメンバーの失効が伝わる場合にも対応する。
      if (event.code === 4403 || event.code === 4404) {
        stopped = true; document.removeEventListener('visibilitychange', reportAway);
        handlers.onGone(event.reason || 'このルームに再入室します'); return;
      }
      timer = setTimeout(open, RETRY_DELAYS[Math.min(attempt++, RETRY_DELAYS.length - 1)]);
    });
  }
  open();
  return {
    presented: revision => timing.presented(revision),
    send(action,inputAt) {
      return new Promise((resolve, reject) => {
        if (!socket || socket.readyState !== WebSocket.OPEN) return reject(new RoomRequestError(0, UNREACHABLE));
        const number = ++requestSequence;
        const timer = setTimeout(() => {
          // 操作が反映済みの可能性があるため再送しない。再接続でサーバーの確定状態を取得する。
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
