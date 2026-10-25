'use client';

// The game's menu, over whatever is on screen (the room, a match, the cards, the editor): Escape
// or a menu button opens and closes it, and nothing behind it is touched meanwhile. The room the
// player is in comes first, then the most useful places of the game. Going
// somewhere keeps the player in their room; only making a new room leaves it, and says so first.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { DEFAULT_VISIBILITY } from '@pplale/game-core/room';
import type { RoomVisibility } from '@pplale/game-core/room';
import { useAuth } from '@/lib/auth';
import { BATTLE_PATH, CARDS_PATH, EDITOR_PATH, PUZZLES_PATH } from '@/lib/game/sessionStore';
import { NotificationVolumeControl } from '../notifications/GameNotifications';
import { NotificationsPage } from '../social/NotificationsPage';
import { PushToggle } from '@/components/pwa/PushToggle';
import GameMenu from '../home/GameMenu';
import { RulesSheet } from './PlazaSheets';
import { OrnateFrame } from '../ornament/OrnateFrame';
import { DiscordMark, PlazaIcon } from './PlazaIcon';
import type { PlazaIconName } from './PlazaIcon';
import { RoomNameSheet } from './RoomManagementSheets';
import { RoomThumbnailImage } from './RoomThumbnailImage';
import { isPlazaPath, plazaHref, usePlaza } from './PlazaProvider';
import { ShareSheet } from './ShareSheet';
import { Sheet } from './Sheet';
import { visibilityInfo } from './visibility';
import styles from './Launchpad.module.css';

import { LaunchpadContext as Context } from './LaunchpadContext';
export { useLaunchpad } from './LaunchpadContext';

/** Something else answers Escape first: a dialog, a sheet, or typing (including choosing kanji). */
function busyWithEscape(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  if (event.isComposing || event.defaultPrevented) return true;
  if (target?.closest('input, textarea, select, [contenteditable=true]')) return true;
  return !!document.querySelector('dialog[open], [aria-modal=true]:not([data-launchpad]), [data-plaza-sheet]');
}

export function LaunchpadProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const pathname = usePathname();
  const previousFocus = useRef<HTMLElement | null>(null);
  const open = useCallback(() => { previousFocus.current = document.activeElement as HTMLElement | null; setExpanded(false); setShown(true); }, []);
  const close = useCallback(() => setShown(false), []);
  const toggle = useCallback(() => { if (shown) close(); else open(); }, [shown, close, open]);
  useEffect(() => { if (!shown) previousFocus.current?.focus(); }, [shown]);
  // Another page: the menu closes behind the player.
  useEffect(() => { setShown(false); }, [pathname]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || busyWithEscape(event)) return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [toggle]);
  const value = useMemo(() => ({ open, close, toggle, shown, expanded, setExpanded }), [open, close, toggle, shown, expanded]);
  // The launch screen (`/game/`) has no menu yet: there is no room to keep.
  return <Context.Provider value={value}><div style={{ display: 'contents' }} inert={shown && pathname !== '/game/'}>{children}</div>{shown && pathname !== '/game/' && <Launchpad onClose={close} expanded={expanded} setExpanded={setExpanded} />}</Context.Provider>;
}

type Tab = 'home' | 'notifications' | 'instance' | 'volume' | 'settings';
type Panel = 'share' | 'new' | 'name' | 'rules' | null;
const tabs: { id: Tab; icon: PlazaIconName; label: string }[] = [
  { id: 'home', icon: 'rocket', label: 'ランチパッドホーム' },
  { id: 'notifications', icon: 'bell', label: '通知' },
  { id: 'instance', icon: 'pin', label: 'いまのインスタンス' },
  { id: 'volume', icon: 'volume', label: '音量' },
  { id: 'settings', icon: 'gear', label: '設定' },
];
interface Place { href: string; icon: PlazaIconName; label: string }
const places: Place[] = [
  { href: '/game/social/', icon: 'heart', label: 'フレンド' },
  { href: CARDS_PATH, icon: 'cards', label: 'カード' },
  { href: `${BATTLE_PATH}free/`, icon: 'sword', label: 'フリーマッチ' },
  { href: PUZZLES_PATH, icon: 'puzzle', label: 'パズル' },
];
const morePlaces: Place[] = [
  { href: EDITOR_PATH, icon: 'pen', label: 'エディタ' },
  { href: `${BATTLE_PATH}history/`, icon: 'history', label: '対戦履歴' },
  { href: '/', icon: 'exit', label: 'サイトへ' },
];

function Launchpad({ onClose, expanded, setExpanded }: { onClose: () => void; expanded: boolean; setExpanded: (expanded: boolean) => void }) {
  const plaza = usePlaza(), router = useRouter(), pathname = usePathname();
  const { user, signInWithGoogle } = useAuth();
  const [tab, setTab] = useState<Tab>('home');
  const [panel, setPanel] = useState<Panel>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const box = useRef<HTMLDivElement>(null), tabId = useId();
  const view = plaza.view, room = view?.plaza;
  useEffect(() => { box.current?.querySelector<HTMLElement>('button, a')?.focus(); }, [expanded]);
  const onRoomPage = isPlazaPath(pathname);
  const go = (href: string) => { onClose(); router.push(href); };
  const home = () => room && view ? onRoomPage ? onClose() : go(plazaHref(view.id)) : go('/game/');
  const current = tabs.find(item => item.id === tab)!;
  const title = tab === 'home' ? 'ランチパッド' : current.label;
  const tools = <div className={styles.headTools}>
    <button className={styles.iconButton} onClick={() => setExpanded(!expanded)} aria-label={expanded ? 'ランチパッドに縮小' : 'ゲームメニューを拡大'} title={expanded ? '縮小' : '拡大'}><PlazaIcon name={expanded ? 'collapse' : 'expand'} /></button>
    <button className={styles.iconButton} onClick={onClose} aria-label="メニューを閉じる"><PlazaIcon name="close" /></button>
  </div>;
  const roomBanner = room && view ? <button className={styles.roomBanner} onClick={() => setTab('instance')} aria-label="いまのルームの詳細">
    <OrnateFrame size="sm" className={styles.roomMain}>
      <RoomThumbnailImage rules={room.nextRules ?? view.rules} className={styles.roomArt} sizes="160px" />
      <span className={styles.roomText}><small>いまのルーム</small><b data-ui-title>{room.name}</b><span><PlazaIcon name={visibilityInfo[room.visibility].icon} />{visibilityInfo[room.visibility].label}<PlazaIcon name="people" />{room.members.length}</span></span>
      <PlazaIcon name="pin" />
    </OrnateFrame>
  </button> : <OrnateFrame size="sm" className={styles.roomMain}>
    <span className={styles.emptyRoomArt}><PlazaIcon name="home" /></span><span className={styles.roomText}><small>いまのルーム</small><b data-ui-title>ホーム</b><span>{plaza.stage.kind === 'entering' ? 'つないでいます…' : 'みんなで遊ぶ場所'}</span></span>
  </OrnateFrame>;
  const content = <>
    <div className={styles.tabPanel} role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-${tab}`} tabIndex={0}>
      {tab === 'home' && <div className={styles.homeContent}>
        {roomBanner}
        <section className={styles.section} aria-label="あそぶ">
          <h3 data-ui-title>あそぶ</h3>
          <nav className={styles.grid} aria-label="ゲームのページ">{places.map(place =>
            <Link key={place.href} href={place.href} className={styles.tile} onClick={onClose} prefetch={false}>
              <PlazaIcon name={place.icon} /><span data-ui-title>{place.label}</span>
            </Link>)}
          </nav>
        </section>
        <section className={styles.section} aria-label="すぐに">
          <h3 data-ui-title>すぐに</h3>
          <div className={`${styles.grid} ${styles.actionGrid}`}>
            <button className={styles.tile} onClick={home}><PlazaIcon name="home" /><span data-ui-title>ホーム</span></button>
            <button className={styles.tile} disabled={!room} onClick={() => setPanel('share')}><DiscordMark /><span data-ui-title>さそう</span></button>
            <button className={styles.tile} onClick={() => setPanel('new')}><PlazaIcon name="door" /><span data-ui-title>新しいルーム</span></button>
          </div>
        </section>
        <footer className={styles.foot}>
          <button className={styles.moreButton} aria-expanded={more} aria-controls={`${tabId}-more`} onClick={() => setMore(value => !value)}><PlazaIcon name={more ? 'close' : 'grid'} />{more ? '閉じる' : 'もっと見る'}</button>
          {more && <nav id={`${tabId}-more`} className={styles.moreLinks} aria-label="その他のページ">{morePlaces.map(place =>
            <Link key={place.href} href={place.href} onClick={onClose} prefetch={false}><PlazaIcon name={place.icon} /><span>{place.label}</span></Link>)}
          </nav>}
        </footer>
      </div>}
      {tab === 'notifications' && <NotificationsPage />}
      {tab === 'instance' && (room && view ? <div className={styles.instance}>
        <RoomThumbnailImage rules={room.nextRules ?? view.rules} alt="ルームのサムネイル" className={styles.instanceArt} sizes="(max-width: 760px) 80vw, 620px" />
        <div className={styles.instanceHeading}><h3 data-ui-title>{room.name}</h3><small>#{view.id}</small></div>
        <div className={styles.instanceMeta}><span><PlazaIcon name={visibilityInfo[room.visibility].icon} />{visibilityInfo[room.visibility].label}</span><span><PlazaIcon name="people" />{room.members.length}人</span><span role="status">{plaza.linked ? '接続中' : '再接続中…'}</span></div>
        <dl className={styles.roomPeople}><div><dt>作成者</dt><dd>{room.creator.name}</dd></div><div><dt>オーナー</dt><dd>{room.members.find(member => member.id === room.owner)?.name ?? 'オーナー不在'}</dd></div></dl>
        <div className={`${styles.grid} ${styles.actionGrid}`}>
          <button className={styles.tile} disabled={room.owner !== room.me} onClick={() => setPanel('name')}><PlazaIcon name="pen" /><span data-ui-title>ルーム名</span></button>
          <button className={styles.tile} onClick={() => setPanel('rules')}><PlazaIcon name="rules" /><span data-ui-title>ルール</span></button>
          <button className={styles.tile} onClick={() => setPanel('share')}><PlazaIcon name="link" /><span data-ui-title>共有リンク</span></button>
        </div>
      </div> : <div className={styles.empty}><PlazaIcon name="pin" /><p>ルームに入ると、ここに表示されます</p><button className={styles.tile} onClick={home}>ホーム</button></div>)}
      {tab === 'volume' && <div className={styles.preferences}><PlazaIcon name="volume" className={styles.preferenceIcon} /><NotificationVolumeControl /></div>}
      {tab === 'settings' && <div className={styles.preferences}>
        <PlazaIcon name="gear" className={styles.preferenceIcon} />
        <section className={styles.setting}><h3 data-ui-title>アカウント</h3>{user ? <Link className={styles.settingLink} href="/game/profile/" onClick={onClose}><PlazaIcon name="star" />プロフィール</Link> : <button className={styles.settingLink} onClick={() => void signInWithGoogle().catch(() => {})}><PlazaIcon name="heart" />ログイン</button>}</section>
        {user && <section className={styles.setting}><h3 data-ui-title>ブラウザの通知</h3><PushToggle /></section>}
        <Link className={styles.settingLink} href="/" onClick={onClose}><PlazaIcon name="exit" />サイトへ</Link>
      </div>}
      {error && <p className={styles.createError} role="alert">{error}</p>}
    </div>
    <nav className={styles.tabBar} role="tablist" aria-label="ランチパッドのタブ" onKeyDown={event => {
      const index = tabs.findIndex(item => item.id === tab);
      const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
      if (next < 0) return;
      event.preventDefault(); setTab(tabs[next].id);
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')[next]?.focus();
    }}>{tabs.map(item => <button key={item.id} id={`${tabId}-${item.id}`} type="button" role="tab" aria-label={item.label} aria-selected={tab === item.id} aria-controls={`${tabId}-panel`} tabIndex={tab === item.id ? 0 : -1} title={item.label} onClick={() => setTab(item.id)}><PlazaIcon name={item.icon} /><span data-ui-title>{item.id === 'home' ? 'ホーム' : item.id === 'instance' ? 'ルーム' : item.label}</span></button>)}</nav>
  </>;

  return <div className={styles.backdrop} onClick={onClose} data-launchpad>
    <div ref={box} inert={!!panel} className={expanded ? styles.expanded : styles.dialog} role="dialog" aria-modal="true" aria-label="ゲームメニュー" data-launchpad onClick={event => event.stopPropagation()} onKeyDown={event => {
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
      {expanded ? <GameMenu overlay={{ title, tools, onReturn: home, dock: true }}>{content}</GameMenu> : <OrnateFrame className={styles.pad}>
        <header className={styles.head}><h2 data-ui-title>{title}</h2>{tools}</header>{content}
      </OrnateFrame>}
    </div>
    <span onClick={event => event.stopPropagation()}>
      {panel === 'share' && view?.plaza && <ShareSheet view={view} onClose={() => setPanel(null)} />}
      {panel === 'new' && <NewRoom onClose={() => setPanel(null)} onDone={onClose} />}
      {panel === 'name' && view?.plaza && <RoomNameSheet view={view} onClose={() => setPanel(null)} />}
      {panel === 'rules' && view?.plaza && <RulesSheet view={view} onClose={() => setPanel(null)} onSave={rules => {
        void plaza.send({ action: 'rules', rules }).then(() => { setError(''); setPanel(null); }, failure => { setError(failure instanceof Error ? failure.message : 'ルールを変えられませんでした'); setPanel(null); });
      }} />}
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
