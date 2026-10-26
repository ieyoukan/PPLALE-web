'use client';

// The game's menu, over whatever is on screen (the room, a match, the editor): Escape or a menu
// button opens and closes it, and nothing behind it is touched meanwhile. Every screen of the game
// outside the board (CPU対決, バトル, カード, フレンド …) opens inside it, over the room, without the
// address changing; a link to one of their old addresses anywhere in the game opens it here too
// (places.ts). Going somewhere keeps the player in their room; only making a new room leaves it,
// and says so first. Small, its tabs run down the left; expanded, the left lists the game's screens
// and the tabs become icons at the top right.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { preconnect } from 'react-dom';
import { DEFAULT_VISIBILITY } from '@pplale/game-core/room';
import type { RoomVisibility } from '@pplale/game-core/room';
import { useAuth } from '@/lib/auth';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';
import { NotificationVolumeControl } from '../notifications/GameNotifications';
import { NotificationsPage } from '../social/NotificationsPage';
import { GameSettings } from '../settings/GameSettings';
import { RulesSheet } from './PlazaSheets';
import { OrnateFrame } from '../ornament/OrnateFrame';
import { DiscordMark, PlazaIcon } from './PlazaIcon';
import { RoomNameSheet } from './RoomManagementSheets';
import { RoomThumbnailImage } from './RoomThumbnailImage';
import { isPlazaPath, plazaHref, usePlaza } from './PlazaProvider';
import { placeOf, samePlace, sectionInfo } from './places';
import type { Place, Section } from './places';
import { ShareSheet } from './ShareSheet';
import { Sheet } from './Sheet';
import { visibilityInfo } from './visibility';
import styles from './Launchpad.module.css';

import { LaunchpadContext as Context, useLaunchpad } from './LaunchpadContext';
export { useLaunchpad };

// The game's screens, loaded when first opened.
const GameLobby = dynamic(() => import('../GameLobby'));
const RoomEntrance = dynamic(() => import('../room/RoomEntrance').then(module => module.RoomEntrance));
const FreeMatch = dynamic(() => import('../room/FreeMatch').then(module => module.FreeMatch));
const MatchHistory = dynamic(() => import('../history/MatchHistory').then(module => module.MatchHistory));
const PuzzleLobby = dynamic(() => import('../puzzles/PuzzleLobby'));
const CardsMenu = dynamic(() => import('../home/CardsMenu').then(module => module.CardsMenu));
const CardGallery = dynamic(() => import('../home/CardGallery'));
const EditorLobby = dynamic(() => import('../editor/EditorLobby'));
const SocialPage = dynamic(() => import('../social/SocialPage').then(module => module.SocialPage));
const ProfilePage = dynamic(() => import('../social/ProfilePage').then(module => module.ProfilePage));
const PlayPerformancePanel = dynamic(() => import('../performance/PlayPerformancePanel').then(module => module.PlayPerformancePanel));

/** Something else answers Escape first: a dialog, a sheet, or typing (including choosing kanji). */
function busyWithEscape(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  if (event.isComposing || event.defaultPrevented) return true;
  if (target?.closest('input, textarea, select, [contenteditable=true]')) return true;
  return !!document.querySelector('dialog[open], [aria-modal=true]:not([data-launchpad]), [data-plaza-sheet]');
}

/** The launchpad's own tabs (small, down the left; expanded, icons at the top right). */
const padTabs: Section[] = ['home', 'notifications', 'instance', 'volume', 'settings'];
/** Expanded, the game's screens down the left. */
const screens: Section[] = ['home', 'cpu', 'battle', 'puzzles', 'cards', 'editor', 'social'];
const home: Place = { section: 'home' };
/** A screen opened from another is shown under it on the rail. */
const parent: Partial<Record<Section, Section>> = { zukan: 'cards', profile: 'social', free: 'battle', history: 'battle', performance: 'battle' };

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

type Panel = 'share' | 'new' | 'name' | 'rules' | null;
const tabLabel = (section: Section) => section === 'home' ? 'ホーム' : section === 'instance' ? 'ルーム' : sectionInfo[section].label;

function Launchpad({ stack, choose }: { stack: Place[]; choose: (section: Section) => void }) {
  const { close: onClose, expanded, setExpanded, openAt, place, back } = useLaunchpad();
  const plaza = usePlaza(), router = useRouter(), pathname = usePathname();
  const [panel, setPanel] = useState<Panel>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const box = useRef<HTMLDivElement>(null), panelRef = useRef<HTMLDivElement>(null), tabId = useId();
  const view = plaza.view, room = view?.plaza;
  const section = place.section;
  // Each screen opens at its top.
  useEffect(() => { panelRef.current?.scrollTo({ top: 0 }); }, [place]);
  // Focus moves into the pad (to the pad itself, so no button looks chosen by it).
  useEffect(() => { box.current?.focus(); }, [expanded]);
  const onRoomPage = isPlazaPath(pathname);
  const go = (href: string) => { onClose(); router.push(href); };
  const toRoom = () => room && view ? onRoomPage ? onClose() : go(plazaHref(view.id)) : go('/game/');
  const rail = expanded ? screens : padTabs;
  // The rail shows the screen the shown one was opened from (a profile from フレンド: フレンド).
  const current = [...stack].reverse().map(item => parent[item.section] ?? item.section).find(item => rail.includes(item));
  const title = sectionInfo[section].label;
  const icons = expanded && <div className={styles.tabIcons} role="tablist" aria-label="ランチパッドのタブ">{padTabs.filter(item => item !== 'home').map(item =>
    <button key={item} id={`${tabId}-${item}`} type="button" role="tab" className={styles.iconButton} aria-label={sectionInfo[item].label} aria-selected={section === item} aria-controls={`${tabId}-panel`} title={sectionInfo[item].label} onClick={() => choose(item)}><PlazaIcon name={sectionInfo[item].icon} /></button>)}</div>;
  const head = <header className={styles.head}>
    {back && <button className={styles.iconButton} onClick={back} aria-label="もどる" title="もどる"><PlazaIcon name="back" /></button>}
    <h2 data-ui-title>{title}</h2>
    <div className={styles.headTools}>
      {icons}
      <button className={styles.iconButton} onClick={() => setExpanded(!expanded)} aria-label={expanded ? 'ランチパッドに縮小' : 'ゲームメニューを拡大'} title={expanded ? '縮小' : '拡大'}><PlazaIcon name={expanded ? 'collapse' : 'expand'} /></button>
      <button className={styles.iconButton} onClick={onClose} aria-label="メニューを閉じる"><PlazaIcon name="close" /></button>
    </div>
  </header>;
  const tile = (target: Section, icon = sectionInfo[target].icon, label = sectionInfo[target].label) =>
    <button key={target} className={styles.tile} onClick={() => openAt({ section: target })}><PlazaIcon name={icon} /><span data-ui-title>{label}</span></button>;
  const roomBanner = room && view ? <button className={styles.roomBanner} onClick={() => openAt({ section: 'instance' })} aria-label="いまのルームの詳細">
    <OrnateFrame size="sm" className={styles.roomMain}>
      <RoomThumbnailImage rules={room.nextRules ?? view.rules} className={styles.roomArt} sizes="160px" />
      <span className={styles.roomText}><small>いまのルーム</small><b data-ui-title>{room.name}</b><span><PlazaIcon name={visibilityInfo[room.visibility].icon} />{visibilityInfo[room.visibility].label}<PlazaIcon name="people" />{room.members.length}</span></span>
      <PlazaIcon name="pin" />
    </OrnateFrame>
  </button> : <OrnateFrame size="sm" className={styles.roomMain}>
    <span className={styles.emptyRoomArt}><PlazaIcon name="home" /></span><span className={styles.roomText}><small>いまのルーム</small><b data-ui-title>ホーム</b><span>{plaza.stage.kind === 'entering' ? 'つないでいます…' : 'みんなで遊ぶ場所'}</span></span>
  </OrnateFrame>;
  const screen = {
    home: <div className={styles.homeContent}>
      {roomBanner}
      {/* Playing (against the CPU, a free match) is done at the room's table: here are the other places. */}
      <section className={styles.section} aria-label="クイックリンク">
        <h3 data-ui-title>クイックリンク</h3>
        <nav className={styles.grid} aria-label="ゲームの画面">{tile('instance', 'pin', 'ルーム')}{tile('social')}{tile('cards')}{tile('history')}</nav>
      </section>
      <div className={styles.quick} role="group" aria-label="ルームの操作">
        <button onClick={toRoom}><PlazaIcon name="home" /><span>ホーム</span></button>
        <button disabled={!room} onClick={() => setPanel('share')}><DiscordMark /><span>さそう</span></button>
        <button onClick={() => setPanel('new')}><PlazaIcon name="door" /><span>新しいルーム</span></button>
      </div>
      <footer className={styles.foot}>
        <button className={styles.moreButton} aria-expanded={more} aria-controls={`${tabId}-more`} onClick={() => setMore(value => !value)}><PlazaIcon name={more ? 'close' : 'grid'} />{more ? '閉じる' : 'もっと見る'}</button>
        {more && <nav id={`${tabId}-more`} className={styles.moreLinks} aria-label="その他の画面">
          {(['puzzles', 'editor', 'battle'] as const).map(target => <button key={target} onClick={() => openAt({ section: target })}><PlazaIcon name={sectionInfo[target].icon} /><span>{sectionInfo[target].label}</span></button>)}
          <Link href="/" prefetch={false}><PlazaIcon name="exit" /><span>サイトへ</span></Link>
        </nav>}
      </footer>
    </div>,
    notifications: <NotificationsPage />,
    instance: room && view ? <div className={styles.instance}>
      <RoomThumbnailImage rules={room.nextRules ?? view.rules} alt="ルームのサムネイル" className={styles.instanceArt} sizes="(max-width: 760px) 80vw, 620px" />
      <div className={styles.instanceHeading}><h3 data-ui-title>{room.name}</h3><small>#{view.id}</small></div>
      <div className={styles.instanceMeta}><span><PlazaIcon name={visibilityInfo[room.visibility].icon} />{visibilityInfo[room.visibility].label}</span><span><PlazaIcon name="people" />{room.members.length}人</span><span role="status">{plaza.linked ? '接続中' : '再接続中…'}</span></div>
      <dl className={styles.roomPeople}><div><dt>作成者</dt><dd>{room.creator.name}</dd></div><div><dt>オーナー</dt><dd>{room.members.find(member => member.id === room.owner)?.name ?? 'オーナー不在'}</dd></div></dl>
      <div className={`${styles.grid} ${styles.actionGrid}`}>
        <button className={styles.tile} disabled={room.owner !== room.me} onClick={() => setPanel('name')}><PlazaIcon name="pen" /><span data-ui-title>ルーム名</span></button>
        <button className={styles.tile} onClick={() => setPanel('rules')}><PlazaIcon name="rules" /><span data-ui-title>ルール</span></button>
        <button className={styles.tile} onClick={() => setPanel('share')}><PlazaIcon name="link" /><span data-ui-title>共有リンク</span></button>
      </div>
    </div> : <div className={styles.empty}><PlazaIcon name="pin" /><p>ルームに入ると、ここに表示されます</p><button className={styles.tile} onClick={toRoom}>ホーム</button></div>,
    volume: <div className={styles.preferences}><PlazaIcon name="volume" className={styles.preferenceIcon} /><NotificationVolumeControl /></div>,
    settings: <GameSettings volume={false} />,
    cpu: <GameLobby />,
    battle: <RoomEntrance />,
    free: <FreeMatch />,
    history: <MatchHistory />,
    puzzles: <PuzzleLobby />,
    cards: <CardsMenu />,
    zukan: <CardGallery />,
    editor: <EditorLobby />,
    social: <SocialPage />,
    profile: <ProfilePage id={place.id} />,
    performance: <PlayPerformancePanel />,
  }[section];
  // The tabs (small) or the game's screens (expanded) down the left side of the pad.
  const tabRail = <nav className={styles.tabBar} role="tablist" aria-orientation="vertical" aria-label={expanded ? 'ゲームの画面' : 'ランチパッドのタブ'} onKeyDown={event => {
      const index = Math.max(0, rail.findIndex(item => item === current));
      const forward = event.key === 'ArrowDown' || event.key === 'ArrowRight', backward = event.key === 'ArrowUp' || event.key === 'ArrowLeft';
      const next = forward ? (index + 1) % rail.length : backward ? (index + rail.length - 1) % rail.length : event.key === 'Home' ? 0 : event.key === 'End' ? rail.length - 1 : -1;
      if (next < 0) return;
      event.preventDefault(); choose(rail[next]);
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')[next]?.focus();
    }}>{rail.map(item => <button key={item} id={`${tabId}-${item}`} type="button" role="tab" aria-label={item === 'home' ? 'ランチパッドホーム' : sectionInfo[item].label} aria-selected={current === item} aria-controls={`${tabId}-panel`} tabIndex={current === item || (!current && item === 'home') ? 0 : -1} title={sectionInfo[item].label} onClick={() => choose(item)}><PlazaIcon name={sectionInfo[item].icon} /><span data-ui-title>{tabLabel(item)}</span></button>)}</nav>;

  return <div className={styles.backdrop} onClick={onClose} data-launchpad>
    <div ref={box} tabIndex={-1} inert={!!panel} className={expanded ? styles.expanded : styles.dialog} role="dialog" aria-modal="true" aria-label="ゲームメニュー" data-launchpad onClick={event => event.stopPropagation()} onKeyDown={event => {
      event.stopPropagation();
      const typing = (event.target as HTMLElement).closest('input:not([type=range]), textarea, select, [contenteditable=true]');
      if (event.key === 'Escape' && !panel && !typing && !event.nativeEvent.isComposing && !event.defaultPrevented) { event.preventDefault(); onClose(); }
      if (event.key === 'Tab') {
        const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, [tabindex="0"]')).filter(element => element.getClientRects().length);
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && (document.activeElement === first || !event.currentTarget.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <OrnateFrame className={styles.pad} data-section={section}>
        {tabRail}{head}
        <div ref={panelRef} className={styles.tabPanel} role="tabpanel" id={`${tabId}-panel`} aria-label={title} tabIndex={0}>
          {screen}
          {error && <p className={styles.createError} role="alert">{error}</p>}
        </div>
      </OrnateFrame>
    </div>
    <span onClick={event => event.stopPropagation()}>
      {panel === 'share' && view?.plaza && <ShareSheet view={view} onClose={() => setPanel(null)} />}
      {panel === 'new' && <NewRoom onClose={() => setPanel(null)} onDone={onClose} />}
      {panel === 'name' && view?.plaza && <RoomNameSheet view={view} onClose={() => setPanel(null)} />}
      {panel === 'rules' && view?.plaza && <RulesSheet view={view} onClose={() => setPanel(null)} onSave={rules => {
        void plaza.send({ action: 'rules', rules }).then(() => { setError(''); setPanel(null); }, failure => { setError(failure instanceof Error ? failure.message : 'ルールを変えられませんでした'); setPanel(null); });
      }} />}
      <InstallPrompt />
    </span>
  </div>;
}

const creationKinds: RoomVisibility[] = ['public', 'friendsPlus', 'friends', 'invitePlus', 'invite'];
/** Choose this room's access at creation; once it exists, access stays fixed. */
function NewRoom({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const plaza = usePlaza(), view = plaza.view, room = view?.plaza;
  const { user } = useAuth();
  const [visibility, setVisibility] = useState<RoomVisibility>(DEFAULT_VISIBILITY);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const seated = !!view && view.players.some(player => player?.member === room?.me);
  const others = (room?.members.length ?? 1) > 1;
  const create = async () => {
    setBusy(true); setError('');
    try {
      const made = await plaza.create(visibility);
      if (made) onDone();
      else setError('ルームを作れませんでした。もう一度お試しください');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'ルームを作れませんでした'); }
    finally { setBusy(false); }
  };
  return <Sheet title="新しいルームを作る" onClose={onClose} wide>
    <div className={styles.newRoom}>
      <p className={styles.createPrompt}>公開範囲を選ぶ</p>
      <OrnateFrame size="sm" className={styles.creationKinds} role="radiogroup" aria-label="ルームの公開範囲">{creationKinds.map(kind => {
        const info = visibilityInfo[kind], needsLogin = !user && (kind === 'friends' || kind === 'friendsPlus');
        return <button key={kind} type="button" role="radio" aria-checked={visibility === kind} disabled={busy || needsLogin}
          className={styles.creationKind} onClick={() => setVisibility(kind)}>
          <span className={styles.creationIcon}><PlazaIcon name={info.icon} />{info.plus && <i>＋</i>}</span>
          <span className={styles.creationText}><b data-ui-title>{info.label}</b><small>{needsLogin ? 'ログインして選べます' : info.note}</small></span>
          <span className={styles.creationCheck} aria-hidden="true">{visibility === kind && <PlazaIcon name="check" />}</span>
        </button>;
      })}</OrnateFrame>
      {view?.status === 'playing' && seated && <p className={styles.warn}><PlazaIcon name="sword" />対戦中の試合は負けになります</p>}
      {room?.owner === room?.me && others && <p className={styles.warn}><PlazaIcon name="crown" />このルームのオーナーがいなくなります</p>}
      {others && <p className={styles.settingNote}>ほかの人はこのルームに残ります。</p>}
      {error && <p className={styles.createError} role="alert">{error}</p>}
      <button className={styles.makeButton} disabled={busy} onClick={() => void create()}><PlazaIcon name="sparkle" /><span data-ui-title>{busy ? '作成中…' : 'この公開範囲で作る'}</span></button>
    </div>
  </Sheet>;
}
