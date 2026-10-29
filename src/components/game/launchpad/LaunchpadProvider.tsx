'use client';

// ルーム接続を維持したまま、メニューの開閉と表示する画面を管理する。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { preconnect } from 'react-dom';
import { isPlazaPath } from '../plaza/PlazaProvider';
import { Launchpad } from './Launchpad';
import { LaunchpadContext as Context } from './LaunchpadContext';
import { padTabs } from './places';
import { placeOf, samePlace } from './places';
import type { Place, Section } from './places';

const home: Place = { section: 'home' };

/** Something else answers Escape first: a dialog, a sheet, or typing (including choosing kanji). */
function busyWithEscape(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  if (event.isComposing || event.defaultPrevented) return true;
  if (target?.closest('input, textarea, select, [contenteditable=true]')) return true;
  return !!document.querySelector('dialog[open], [aria-modal=true]:not([data-launchpad]), [data-plaza-sheet]');
}

export function LaunchpadProvider({ children }: { children: ReactNode }) {
  // Profiles, decks and friends are read from Firestore as soon as a screen of them opens.
  preconnect('https://firestore.googleapis.com', { crossOrigin: 'anonymous' });
  const [shown, setShown] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [stack, setStack] = useState<Place[]>([home]);
  const pathname = usePathname();
  const previousFocus = useRef<HTMLElement | null>(null), showing = useRef(false), across = useRef(false), lastPath = useRef(pathname);
  useEffect(() => { showing.current = shown; }, [shown]);
  const remember = () => { if (!showing.current) previousFocus.current = document.activeElement as HTMLElement | null; };
  const open = useCallback(() => { remember(); setExpanded(false); setStack([home]); setShown(true); }, []);
  const close = useCallback(() => setShown(false), []);
  const toggle = useCallback(() => { if (showing.current) close(); else open(); }, [close, open]);
  const openAt = useCallback((place: Place, crossing = false) => {
    remember();
    across.current = crossing;
    // Back to where it was opened from is a step back, not another step.
    setStack(current => !showing.current ? place.section === 'home' ? [home] : [home, place]
      : current.length > 1 && samePlace(current[current.length - 2], place) ? current.slice(0, -1)
      : samePlace(current[current.length - 1], place) ? current : [...current, place]);
    // The game's screens want the room: they open expanded.
    if (!padTabs.includes(place.section)) setExpanded(true);
    setShown(true);
  }, []);
  const choose = useCallback((section: Section) => setStack([{ section }]), []);
  const back = useMemo(() => stack.length > 1 ? () => setStack(current => current.slice(0, -1)) : null, [stack.length]);
  // Another page (a board): the menu closes behind the player. On the way to the room from an old
  // address it stays open.
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    if (across.current && (pathname === '/game/' || isPlazaPath(pathname))) { if (isPlazaPath(pathname)) across.current = false; return; }
    across.current = false;
    setShown(false);
  }, [pathname]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || busyWithEscape(event)) return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [toggle]);
  // A link to one of the game's screens, anywhere in the game, opens it here instead of a page.
  useEffect(() => {
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || (anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      const place = url.origin === window.location.origin ? placeOf(url) : null;
      if (!place) return;
      event.preventDefault();
      openAt(place);
    };
    document.addEventListener('click', click, true);
    return () => document.removeEventListener('click', click, true);
  }, [openAt]);
  useEffect(() => { if (!shown) previousFocus.current?.focus(); }, [shown]);
  const place = stack[stack.length - 1];
  const value = useMemo(() => ({ open, close, toggle, shown, expanded, setExpanded, openAt, place, back }), [open, close, toggle, shown, expanded, openAt, place, back]);
  return <Context.Provider value={value}>
    <div style={{ display: 'contents' }} inert={shown}>{children}</div>
    {shown && <Launchpad stack={stack} choose={choose} />}
  </Context.Provider>;
}
