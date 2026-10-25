'use client';

// The game's menu, over whatever is on screen (the room, a match, the cards, the editor): Escape
// or a menu button opens and closes it, and nothing behind it is touched meanwhile. The room the
// player is in comes first (inviting, the CPU), then every other place of the game. Going
// somewhere keeps the player in their room; only making a new room leaves it, and says so first.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { other } from '@pplale/game-core';
import type { Side } from '@pplale/game-core';
import { DEFAULT_VISIBILITY } from '@pplale/game-core/room';
import type { RoomVisibility } from '@pplale/game-core/room';
import { useAuth } from '@/lib/auth';
import { BATTLE_PATH, CARDS_PATH, CPU_PATH, EDITOR_PATH, NOTIFICATIONS_PATH, PUZZLES_PATH } from '@/lib/game/sessionStore';
import { NotificationSoundToggle } from '../notifications/GameNotifications';
import { Avatar } from './Avatar';
import { CpuSheet } from './PlazaSheets';
import { DiscordMark, PlazaIcon } from './PlazaIcon';
import type { PlazaIconName } from './PlazaIcon';
import { RoomNameSheet } from './RoomManagementSheets';
import { isPlazaPath, plazaHref, usePlaza } from './PlazaProvider';
import { ShareSheet } from './ShareSheet';
import { Sheet } from './Sheet';
import { guestIcon, useProfiles } from './useProfiles';
import { visibilityInfo } from './visibility';
import styles from './Launchpad.module.css';

const Context = createContext<{ open: () => void; close: () => void; toggle: () => void; shown: boolean }>({ open: () => {}, close: () => {}, toggle: () => {}, shown: false });
export const useLaunchpad = () => useContext(Context);

/** Something else answers Escape first: a dialog, a sheet, or typing (including choosing kanji). */
function busyWithEscape(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  if (event.isComposing || event.defaultPrevented) return true;
  if (target?.closest('input, textarea, select, [contenteditable=true]')) return true;
  return !!document.querySelector('dialog[open], [aria-modal=true]:not([data-launchpad]), [data-plaza-sheet]');
}

export function LaunchpadProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false);
  const pathname = usePathname();
  const open = useCallback(() => setShown(true), []), close = useCallback(() => setShown(false), []);
  const toggle = useCallback(() => setShown(value => !value), []);
  // Another page: the menu closes behind the player.
  useEffect(() => { setShown(false); }, [pathname]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || busyWithEscape(event)) return;
      event.preventDefault();
      setShown(value => !value);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const value = useMemo(() => ({ open, close, toggle, shown }), [open, close, toggle, shown]);
  // The launch screen (`/game/`) has no menu yet: there is no room to keep.
  return <Context.Provider value={value}>{children}{shown && pathname !== '/game/' && <Launchpad onClose={close} />}</Context.Provider>;
}

type Panel = 'home' | 'share' | 'cpu' | 'settings' | 'new' | 'name';
interface Place { href: string; icon: PlazaIconName; label: string; tone: string }
const places: Place[] = [
  { href: '/game/social/', icon: 'heart', label: 'フレンド', tone: 'pink' },
  { href: NOTIFICATIONS_PATH, icon: 'bell', label: '通知', tone: 'vanilla' },
  { href: CARDS_PATH, icon: 'cards', label: 'カード', tone: 'sage' },
  { href: CPU_PATH, icon: 'cpu', label: 'ひとりで', tone: 'peach' },
  { href: `${BATTLE_PATH}free/`, icon: 'sword', label: 'フリーマッチ', tone: 'pink' },
  { href: PUZZLES_PATH, icon: 'puzzle', label: 'パズル', tone: 'sage' },
  { href: EDITOR_PATH, icon: 'pen', label: 'エディタ', tone: 'vanilla' },
  { href: `${BATTLE_PATH}history/`, icon: 'history', label: '対戦履歴', tone: 'peach' },
];

function Launchpad({ onClose }: { onClose: () => void }) {
  const plaza = usePlaza(), router = useRouter(), pathname = usePathname();
  const { user, signInWithGoogle } = useAuth();
  const [panel, setPanel] = useState<Panel>('home');
  const box = useRef<HTMLDivElement>(null);
  const view = plaza.view, room = view?.plaza;
  const profiles = useProfiles(room?.members.map(member => member.profileId) ?? []);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('button, a')?.focus();
    return () => previous?.focus?.();
  }, []);
  const onRoomPage = isPlazaPath(pathname);
  const mine = view ? view.players.findIndex(player => player?.member === room?.me) : -1;
  // The CPU sits across from the player, or wherever there is room.
  const cpuSeat: Side | null = !view || view.status === 'playing' || view.players.some(player => player?.cpu) ? null
    : mine >= 0 ? (view.players[other(mine as Side)] ? null : other(mine as Side)) : !view.players[1] ? 1 : !view.players[0] ? 0 : null;
  const go = (href: string) => { onClose(); router.push(href); };
  const subpanel = panel !== 'home';

  return <div className={styles.backdrop} onClick={onClose} data-launchpad>
    <div ref={box} className={styles.pad} role="dialog" aria-modal="true" aria-label="ゲームメニュー" data-launchpad onClick={event => event.stopPropagation()}
      onKeyDown={event => { if (event.key === 'Escape' && !subpanel) { event.stopPropagation(); event.preventDefault(); onClose(); } }}>
      <button className={styles.close} onClick={onClose} aria-label="メニューを閉じる"><PlazaIcon name="close" /></button>
      {room && view ? <section className={styles.roomCard} aria-label="いまのルーム">
        <button className={styles.roomMain} onClick={() => onRoomPage ? onClose() : go(plazaHref(view.id))}>
          <span className={styles.roomBadge}><PlazaIcon name={visibilityInfo[room.visibility].icon} /></span>
          <span className={styles.roomText}><b data-ui-title>{room.name}</b><small>{visibilityInfo[room.visibility].label}・{view.status === 'playing' ? '対戦中' : '待ち合わせ中'}</small></span>
          <span className={styles.faces}>{room.members.slice(0, 5).map(member => <Avatar key={member.id} card={member.profileId && profiles[member.profileId] ? profiles[member.profileId].iconCardId : guestIcon(member.id)} size={34} dim={!member.online} />)}
            {room.members.length > 5 && <b>+{room.members.length - 5}</b>}</span>
          {!onRoomPage && <span className={styles.enterHint}><PlazaIcon name="back" />もどる</span>}
        </button>
        <div className={styles.roomActions}>
          <button className={styles.bigAction} data-tone="cocoa" onClick={() => setPanel('share')}><DiscordMark /><span data-ui-title>さそう</span></button>
          <button className={styles.bigAction} disabled={cpuSeat === null} onClick={() => setPanel('cpu')}><PlazaIcon name="cpu" /><span data-ui-title>CPUを呼ぶ</span></button>
          {room.owner === room.me && <button className={styles.bigAction} onClick={() => setPanel('name')}><PlazaIcon name="pen" /><span data-ui-title>名前</span></button>}
        </div>
      </section> : <section className={styles.roomCard}><button className={styles.roomMain} onClick={() => go('/game/')}>
        <span className={styles.roomBadge}><PlazaIcon name="home" /></span><span className={styles.roomText}><b data-ui-title>ルームへ</b><small>{plaza.stage.kind === 'entering' ? 'つないでいます…' : 'みんなで遊ぶ場所'}</small></span>
      </button></section>}

      <nav className={styles.grid} aria-label="ゲームのページ">{places.map(place =>
        <Link key={place.href} href={place.href} className={styles.tile} data-tone={place.tone} onClick={onClose} prefetch={false} aria-current={pathname?.startsWith(place.href) ? 'page' : undefined}>
          <span className={styles.tileIcon}><PlazaIcon name={place.icon} /></span><span data-ui-title>{place.label}</span>
        </Link>)}
      </nav>

      <footer className={styles.foot}>
        <Link href={user ? '/game/profile/' : '#'} className={styles.me} onClick={event => { if (!user) { event.preventDefault(); signInWithGoogle().catch(() => {}); } else onClose(); }}>
          <PlazaIcon name={user ? 'star' : 'heart'} /><span>{user ? 'プロフィール' : 'ログイン'}</span>
        </Link>
        <button className={styles.footButton} onClick={() => setPanel('settings')}><PlazaIcon name="gear" /><span>設定</span></button>
        <button className={styles.footButton} onClick={() => setPanel('new')}><PlazaIcon name="door" /><span>新しいルーム</span></button>
        <Link href="/" className={styles.footButton}><PlazaIcon name="exit" /><span>サイトへ</span></Link>
      </footer>
    </div>
    <span onClick={event => event.stopPropagation()}>
      {panel === 'share' && view?.plaza && <ShareSheet view={view} onClose={() => setPanel('home')} />}
      {panel === 'cpu' && cpuSeat !== null && <CpuSheet onClose={() => setPanel('home')} onChoose={level => { setPanel('home'); onClose(); void plaza.send({ action: 'cpu', seat: cpuSeat, level }).catch(() => {}); if (!onRoomPage && view) router.push(plazaHref(view.id)); }} />}
      {panel === 'settings' && <Settings onClose={() => setPanel('home')} />}
      {panel === 'new' && <NewRoom onClose={() => setPanel('home')} onDone={onClose} />}
      {panel === 'name' && view?.plaza && <RoomNameSheet view={view} onClose={() => setPanel('home')} />}
    </span>
  </div>;
}

/** Game-wide preferences; the room's visibility is chosen on its creation screen. */
function Settings({ onClose }: { onClose: () => void }) {
  return <Sheet title="設定" onClose={onClose}>
    <section className={styles.setting}><h3>通知の音</h3><NotificationSoundToggle /></section>
  </Sheet>;
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
      <div className={styles.creationKinds} role="radiogroup" aria-label="ルームの公開範囲">{creationKinds.map(kind => {
        const info = visibilityInfo[kind], needsLogin = !user && (kind === 'friends' || kind === 'friendsPlus');
        return <button key={kind} type="button" role="radio" aria-checked={visibility === kind} disabled={busy || needsLogin}
          className={styles.creationKind} onClick={() => setVisibility(kind)}>
          <span className={styles.creationIcon}><PlazaIcon name={info.icon} />{info.plus && <i>＋</i>}</span>
          <span className={styles.creationText}><b data-ui-title>{info.label}</b><small>{needsLogin ? 'ログインして選べます' : info.note}</small></span>
          <span className={styles.creationCheck} aria-hidden="true">{visibility === kind && <PlazaIcon name="check" />}</span>
        </button>;
      })}</div>
      {view?.status === 'playing' && seated && <p className={styles.warn}><PlazaIcon name="sword" />対戦中の試合は負けになります</p>}
      {room?.owner === room?.me && others && <p className={styles.warn}><PlazaIcon name="crown" />このルームのオーナーがいなくなります</p>}
      {others && <p className={styles.settingNote}>ほかの人はこのルームに残ります。</p>}
      {error && <p className={styles.createError} role="alert">{error}</p>}
      <button className={styles.makeButton} disabled={busy} onClick={() => void create()}><PlazaIcon name="sparkle" /><span data-ui-title>{busy ? '作成中…' : 'この公開範囲で作る'}</span></button>
    </div>
  </Sheet>;
}
