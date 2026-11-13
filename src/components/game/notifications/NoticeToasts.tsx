'use client';

// 招待などの知らせを、画面の中央下に半透明で数秒出す（押すとそのURLへ）。届く道は3つ：Service Workerが受けたPush
// （sw.js が開いている画面へも渡す）、ログイン中の招待の定期確認、アプリ内からの show。タブが裏にあって
// ブラウザ通知が許可されていれば、OSの通知も出す。同じ tag は1分以内に重ねない。招待は、前回の確認で無かったものだけ知らせる。
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { readInvitations, roomServerUrl } from '@/lib/game/room/client';
import { showSystemNotice } from '@/lib/game/systemNotice';
import type { Notice } from '@/lib/game/systemNotice';
import type { RoomInfo } from '@pplale/game-core/room';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { useI18n } from '@/i18n/LocaleProvider';
import { plazaHref, usePlaza } from '../plaza/PlazaProvider';
import styles from './NoticeToasts.module.css';

/** The invitations pending at the last look, so one that comes again after it was gone is told again. */
const PENDING_KEY = 'pplale-invites-pending-v1';
/** The same notice (by tag) is not told twice within this long (a push and the invitations' look can bring the same one). */
const REPEAT_MS = 60_000;
/** How long a notice stays (ms); NoticeToasts.module.css fades it out over its last part. */
export const NOTICE_MS = 6000;
const MAX_SHOWN = 3;

/** `invitations`: the rooms this player is invited to now (signed in), shared with the social screen's list. */
const Context = createContext<{ show: (notice: Notice) => void; invitations: RoomInfo[] }>({ show: () => {}, invitations: [] });
export const useNotices = () => useContext(Context);

export function NoticeToasts({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { t } = useI18n();
  const { id: here } = usePlaza();
  const { user } = useAuth();
  const [shown, setShown] = useState<(Notice & { key: number })[]>([]);
  const told = useRef(new Map<string, number>());
  const [invitations, setInvitations] = useState<RoomInfo[]>([]);
  const counter = useRef(0);
  const hereRef = useRef(here);
  useEffect(() => { hereRef.current = here; }, [here]);

  const show = useCallback((notice: Notice) => {
    const now = Date.now(), before = told.current.get(notice.tag);
    if (before !== undefined && now - before < REPEAT_MS) return;
    told.current.set(notice.tag, now);
    setShown(list => [...list, { ...notice, key: ++counter.current }].slice(-MAX_SHOWN));
    if (document.hidden) void showSystemNotice(notice);
  }, []);

  // Pushes the room server sends (sw.js passes them on to the open pages as well as showing them).
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const receive = (event: MessageEvent) => {
      const data = event.data as { type?: string; notice?: Notice } | null;
      if (data?.type === 'pplale-notice' && data.notice?.title && data.notice.tag) show(data.notice);
    };
    navigator.serviceWorker.addEventListener('message', receive);
    return () => navigator.serviceWorker.removeEventListener('message', receive);
  }, [show]);

  // Invitations, wherever the player is in the game (signed in only): every 30 s while the page is shown. This is the
  // one look at them (the social screen shows the same list). One is told when it was not pending at the last look.
  useEffect(() => {
    if (!user || !roomServerUrl) { setInvitations([]); return; }
    let current = true;
    const ask = () => {
      if (document.hidden) return;
      void readInvitations().then(({ rooms }) => {
        if (!current) return;
        setInvitations(rooms);
        let pending: string[] = [];
        try { pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? '[]') as string[]; } catch {}
        for (const room of rooms) if (room.id !== hereRef.current && !pending.includes(room.id)) show({ title: t('{name}が招待してくれたよ', { name: room.host }), body: t('タップしてルームへ行こう'), url: plazaHref(room.id), tag: `invite-${room.id}` });
        try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(rooms.map(room => room.id))); } catch {}
      }, () => {});
    };
    ask();
    const timer = setInterval(ask, 30_000);
    document.addEventListener('visibilitychange', ask);
    return () => { current = false; clearInterval(timer); document.removeEventListener('visibilitychange', ask); };
  }, [user, show, t]);

  const dismiss = (key: number) => setShown(list => list.filter(item => item.key !== key));
  const value = useMemo(() => ({ show, invitations }), [show, invitations]);
  return <Context.Provider value={value}>
    {children}
    {shown.length > 0 && <div className={styles.toasts} role="status" aria-live="polite">
      {shown.map(notice => <button key={notice.key} type="button" className={styles.toast} style={{ animationDuration: `${NOTICE_MS}ms` }}
        onAnimationEnd={() => dismiss(notice.key)}
        onClick={() => { dismiss(notice.key); if (notice.url) router.push(notice.url); }}>
        <GameIcon name="letter" />
        <span className={styles.text}><b>{notice.title}</b>{notice.body && <small>{notice.body}</small>}</span>
      </button>)}
    </div>}
  </Context.Provider>;
}
