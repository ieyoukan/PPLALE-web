'use client';

// A page of the game opened from a room, over it: the room stays on screen (and connected) behind
// the window, and closing it (×, Escape) returns to the room as it is now, however far the window went
// (図鑑 from カード); the browser's back steps back one page.
// The page itself is the same component as on its own address (src/app/game/room/[roomId]/@window).
import { useCallback, useEffect, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import GameMenu, { MenuCorner } from '../home/GameMenu';
import { useLaunchpad } from './LaunchpadContext';
import { OrnateFrame } from '../ornament/OrnateFrame';
import { PlazaIcon } from './PlazaIcon';
import { plazaHref, usePlaza } from './PlazaProvider';
import styles from './RoomWindow.module.css';

const titles: Record<string, string> = {
  social: 'フレンド', notifications: '通知', profile: 'プロフィール', cards: 'カード', 'cards/zukan': 'カード図鑑',
  cpu: 'CPU対決', battle: 'バトル', 'battle/free': 'フリーマッチ', 'battle/history': '対戦履歴', puzzles: 'リーサルパズル', editor: '盤面エディタ', settings: '設定',
};

export function RoomWindow({ page, children }: { page: string; children: ReactNode }) {
  const router = useRouter();
  const { expanded, setExpanded } = useLaunchpad();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>('button')?.focus();
    return () => previous?.focus?.();
  }, [expanded]);
  const { id } = usePlaza();
  const close = useCallback(() => { if (id) router.push(plazaHref(id)); else router.back(); }, [id, router]);
  // Escape wherever focus is, unless something inside (a sheet, typing kanji) answers it first.
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
      if ((event.target as HTMLElement | null)?.closest('input, textarea, select') || document.querySelector('[data-plaza-sheet], dialog[open]')) return;
      event.preventDefault();
      close();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [close]);
  const keyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') event.stopPropagation();
    if (event.key !== 'Tab') return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]')).filter(element => element.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  const title = titles[page] ?? 'ページ';
  const pathname = usePathname() ?? '';
  const tools = <div className={styles.tools}>
    {expanded && <MenuCorner pathname={pathname} />}
    <button className={styles.tool} onClick={() => setExpanded(!expanded)} aria-label={expanded ? 'メニューを縮小' : 'ゲームメニューを拡大'}><PlazaIcon name={expanded ? 'collapse' : 'expand'} /></button>
    <button className={styles.tool} onClick={close} aria-label="ルームにもどる"><PlazaIcon name="close" /></button>
  </div>;
  return <div className={styles.backdrop} onClick={close} data-room-window onKeyDown={keyboard}>
    {expanded ? <div ref={panel} className={styles.expanded} role="dialog" aria-modal="true" aria-label={title} onClick={event => event.stopPropagation()}>
      <GameMenu overlay={{ title, tools, onReturn: close }}>{children}</GameMenu>
    </div> : <OrnateFrame ref={panel} className={styles.window} role="dialog" aria-modal="true" aria-label={title} onClick={event => event.stopPropagation()}>
      <header className={styles.head}><h2 data-ui-title>{title}</h2>{tools}</header>
      <div className={styles.body} data-page={page}>{children}</div>
    </OrnateFrame>}
  </div>;
}
