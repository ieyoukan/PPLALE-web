'use client';

// A room between matches: its table with two seats on the mat, everyone in the room beside it, the
// rules, and (for whoever sits) the deck and 準備OK. Taking a seat, calling the CPU or getting ready
// are single taps on the table itself; what needs choosing rises as a sheet over it.
// The table stands in the room in 3D with the match's board lying on it, seen from its side: a seat
// at each end. Upright seat controls sit above it. When the match starts the board comes round, the player's seat to
// the front, and is looked down on from above.
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { BoardSurfaceContext } from '../board/BoardSurfaceMount';
import { cpuLevels } from '@pplale/game-core';
import type { Side } from '@pplale/game-core';
import type { RoomAction, RoomPlayer, RoomView } from '@pplale/game-core/room';
import { useAuth } from '@/lib/auth';
import { usableChoice } from '@/lib/game/deckSources';
import { randomSeed } from '@/lib/game/match';
import { useDeckChoices } from '../DeckSelect';
import { useLaunchpad } from '../launchpad/LaunchpadContext';
import { SEAT_DECK_SAVED } from '../decks/seatDeck';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
import { Avatar } from '@/components/shared/player/Avatar';
import { ProfileLink } from '@/components/shared/player/ProfileLink';
import { CardArtwork } from '@/components/shared/card/CardArtwork';
import { RoomScene } from './RoomScene';
import { DeckContentsSheet, DeckSheet, OpponentSheet, RulesSheet } from './PlazaSheets';
import { CpuSheet } from './CpuSheet';
import { RoomThumbnailImage } from './RoomThumbnailImage';
import { ShareSheet } from './ShareSheet';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { usePlaza } from './PlazaProvider';
import { guestIcon, useProfiles } from '@/components/shared/player/useProfiles';
import { visibilityInfo } from './visibility';
import { BeginnerMissionLink } from '../missions/BeginnerMissionLink';
import { useI18n } from '@/i18n/LocaleProvider';
import styles from './Plaza.module.css';

const DECK_KEY = 'pplale-plaza-deck-v1';
type Open = null | 'deck' | 'deckContents' | 'rules' | 'share' | { opponent: Side } | { cpu: Side };

/** The deck this browser chose last, so the next match starts with it already chosen. */
function useChosenDeck() {
  const [selected, setSelected] = useState('');
  useEffect(() => { try { setSelected(localStorage.getItem(DECK_KEY) ?? ''); } catch { /* Chosen anew each time. */ } }, []);
  const choose = (id: string) => { setSelected(id); try { localStorage.setItem(DECK_KEY, id); } catch { /* Kept for this visit. */ } };
  return [selected, choose] as const;
}

export function PlazaTable({ view, onMenu, match }: { view: RoomView; onMenu: () => void; match?: {
  viewer: Side; animate: boolean; content: ReactNode;
} }) {
  const root = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const [cameraReady, setCameraReady] = useState(true);
  // The match's board is first drawn hidden on the table, its pictures decoded; only then does the camera
  // move. Rendering the board while the camera turns made the turn stutter or jump straight to the end.
  const staged = useStagedBoard(!!match, match?.animate ?? true, root, target);
  const playing = !!match && staged;
  const plaza = usePlaza(), room = view.plaza!;
  const { t, gameText, nameText } = useI18n();
  const { user, signInWithGoogle } = useAuth();
  const mine = view.players.findIndex(player => player?.member === room.me);
  const mySeat = mine < 0 ? null : mine as Side;
  const profiles = useProfiles([...room.members.map(member => member.profileId), ...view.players.map(player => player?.profileId)]);
  const iconOf = (member?: string, profileId?: string) => profileId && profiles[profileId] ? profiles[profileId].iconCardId : guestIcon(member ?? '');
  const [open, setOpen] = useState<Open>(null);
  useEffect(() => { if (playing) setOpen(null); }, [playing]);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const ask = (action: RoomAction | (() => Promise<void>)) => {
    setBusy(true); setError('');
    (typeof action === 'function' ? action() : plaza.send(action))
      .catch((failure: unknown) => setError(failure instanceof Error ? failure.message : '送れませんでした'))
      .finally(() => setBusy(false));
  };

  const [selected, choose] = useChosenDeck();
  const { openAt } = useLaunchpad();
  // A deck made or edited from this seat in the launchpad is the seat's deck when it is saved.
  useEffect(() => {
    const saved = (event: Event) => { const id = (event as CustomEvent<{ id: string }>).detail?.id; if (id) choose(`saved:${id}`); };
    window.addEventListener(SEAT_DECK_SAVED, saved);
    return () => window.removeEventListener(SEAT_DECK_SAVED, saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { choices, saved } = useDeckChoices(view.rules, 'このルーム');
  const chosen = usableChoice(choices, selected);
  const me = mySeat === null ? null : view.players[mySeat]!;
  const ready = () => { if (chosen) ask({ action: 'ready', deck: chosen.deck(randomSeed()) }); };
  const owner = room.members.find(member => member.id === room.owner);
  const info = visibilityInfo[room.visibility];

  /** One seat on the mat: who sits there, or the way to sit there (or to call the CPU). */
  const seat = (side: Side) => {
    const player = view.players[side];
    if (!player) return <OrnateFrame as="button" appearance="panel" size="sm" faint className={`${styles.seat} ${styles.seatEmpty} ${styles.sitButton}`} key={`empty-${side}`}
      disabled={busy} onClick={() => mySeat === null ? ask({ action: 'sit', seat: side }) : setOpen({ opponent: side })}
      aria-label={t(mySeat === null ? 'この席にすわる' : '対戦相手をえらぶ')}>
      <span className={`${styles.plus} ${mySeat === null ? '' : styles.plusSoft}`}><GameIcon name={mySeat === null ? 'plus' : 'people'} /></span>
      <b data-ui-title>{t(mySeat === null ? 'すわる' : '相手をえらぶ')}</b>
    </OrnateFrame>;
    const self = side === mySeat;
    return <div className={`${styles.seat} ${styles.playerSeat}`} data-ready={player.ready || undefined} data-self={self || undefined} key={`${player.member ?? player.cpu}-${side}`}>
      <ProfileLink self={self} profileId={player.profileId} className={styles.seatPortrait} label={self ? t('自分のプロフィール') : t('{name}のプロフィール', { name: player.name })}>
        <Avatar card={iconOf(player.member, player.profileId)} cpu={!!player.cpu} size={104} dim={!player.online} />
      </ProfileLink>
      <span className={styles.seatName}><b data-ui-title>{nameText(player.name)}</b>{self && <small>{t('あなた')}</small>}</span>
      {!self && <SeatState player={player} />}
      {self && me && <div className={styles.seatActions}>
        <OrnateFrame as="button" size="sm" className={styles.deckChip} disabled={busy} onClick={() => setOpen(me.ready && chosen ? 'deckContents' : 'deck')} aria-label={t('デッキ: {name}', { name: chosen ? t(chosen.name) : t('なし') })}>
          <span className={styles.deckArt}><PlayableArt id={chosen && chosen.source !== 'random' ? chosen.deck(0).playable : undefined} /></span>
          <span className={styles.deckName}><small>{t('デッキ')}</small><b>{chosen ? t(chosen.name) : t('えらぶ')}</b></span>
        </OrnateFrame>
        {me.ready
          ? <OrnateFrame as="button" size="line" className={`${styles.ready} ${styles.readyDone}`} disabled={busy} onClick={() => ask({ action: 'unready' })}><GameIcon name="check" /><span data-ui-title>{t('じゅんびOK')}</span></OrnateFrame>
          : <OrnateFrame as="button" size="line" className={styles.ready} disabled={busy || !chosen} onClick={ready}><span data-ui-title>{t('じゅんびOK!')}</span></OrnateFrame>}
      </div>}
      {self && <button className={styles.leaveSeat} disabled={busy} onClick={() => ask({ action: 'stand' })} aria-label={t('席を立つ')}><GameIcon name="exit" /><span data-ui-title>{t('席を立つ')}</span></button>}
      {player.cpu && <div className={styles.seatActions}><OrnateFrame as="button" size="sm" className={styles.deckChip} disabled={busy} onClick={() => setOpen({ cpu: side })} aria-label={t('CPUのデッキ: {name}', { name: t(player.deck ?? 'おまかせデッキ') })}>
        <span className={styles.deckArt}><GameIcon name="cards" /></span><span className={styles.deckName}><small>{t('CPUのデッキ')}</small><b>{t(player.deck ?? 'おまかせデッキ')}</b></span>
      </OrnateFrame></div>}
      {player.cpu && <button className={styles.seatCorner} disabled={busy} onClick={() => ask({ action: 'dismissCpu' })} aria-label={t('CPUに帰ってもらう')}><GameIcon name="close" /></button>}
    </div>;
  };

  return <div ref={root} className={styles.table} data-room-view data-playing={playing || undefined} data-camera-ready={cameraReady}>
    <header className={styles.top} inert={playing || !cameraReady}>
      <OrnateFrame as="button" size="sm" className={styles.roomPlate} onClick={onMenu} aria-label={t('{name}（{visibility}）のメニュー', { name: room.name, visibility: t(info.label) })}>
        <span className={styles.roomBadge} data-visibility={room.visibility}><GameIcon name={info.icon} />{info.plus && <i>＋</i>}</span>
        <span className={styles.roomTitle}><b data-ui-title>{nameText(room.name)}</b><small>{t(info.label)}・{nameText(room.creator.name)}</small></span>
        <span className={styles.count}><GameIcon name="people" />{room.members.length}</span>
      </OrnateFrame>
      <div className={styles.topActions}>
        <BeginnerMissionLink />
        <button className={styles.inviteButton} onClick={() => setOpen('share')}><GameIcon name="letter" /><span data-ui-title>{t('さそう')}</span></button>
        <button className={styles.round} onClick={onMenu} aria-label={t('メニュー')}><GameIcon name="grid" /></button>
      </div>
    </header>

    <OrnateFrame as="aside" tone="cream" className={styles.people} aria-label={t('ルームにいる人')} inert={playing || !cameraReady}>
      <ul>{room.members.map(member => <li key={member.id} data-away={!member.online || undefined}>
        <ProfileLink self={member.id === room.me} profileId={member.profileId} className={styles.person} label={member.id === room.me ? t('自分のプロフィール') : t('{name}のプロフィール', { name: member.name })}>
          <Avatar card={iconOf(member.id, member.profileId)} size={42} dim={!member.online} />
          <span className={styles.personName}>{nameText(member.name)}{member.id === room.me && <small>{t('あなた')}</small>}</span>
          <span className={styles.personMarks}>
            {member.id === room.owner && <span className={styles.crown} role="img" aria-label={t('オーナー')}><GameIcon name="crown" /></span>}
            {member.seat !== undefined ? <span role="img" aria-label={t('席にいる')}><GameIcon name="seat" /></span> : <span role="img" aria-label={t('観戦')}><GameIcon name="eye" /></span>}
          </span>
        </ProfileLink>
      </li>)}</ul>
    </OrnateFrame>

    <RoomScene seats={[seat(0), seat(1)]} root={root} active={playing} viewer={match?.viewer ?? 0} animate={match?.animate ?? true}
      ready={cameraReady} onReady={setCameraReady} onSurface={setTarget} />

    <aside className={styles.side} inert={playing || !cameraReady}>
      <button className={styles.rulesCard} onClick={() => setOpen('rules')} aria-label={t('ルール')}>
        <RoomThumbnailImage rules={view.rules} alt={t('ルームのルール')} className={styles.rulesThumbnail} sizes="360px" />
      </button>
      {owner ? <span className={styles.ownerChip}><GameIcon name="crown" />{owner.id === room.me ? t('あなたがオーナー') : owner.name}</span>
        : <button className={styles.claim} disabled={busy || room.canClaimOwner === false} title={room.canClaimOwner === false ? t('ログイン中の人が先にオーナーを引き継げます') : undefined} onClick={() => ask({ action: 'claim' })}><GameIcon name="crown" /><span data-ui-title>{t('オーナーになる')}</span></button>}
    </aside>

    {!!room.requests?.length && <div className={styles.requests} role="region" aria-label={t('入りたい人')}>{room.requests.map(request => <OrnateFrame size="sm" key={request.profileId} className={styles.request}>
      <GameIcon name="letter" /><span>{withName(t('{name}が入りたいって'), <b>{request.name}</b>)}</span>
      <button disabled={busy} onClick={() => ask({ action: 'answer', profileId: request.profileId, accept: true })} aria-label={t('{name}を招待する', { name: request.name })}><GameIcon name="check" /></button>
      <button disabled={busy} onClick={() => ask({ action: 'answer', profileId: request.profileId, accept: false })} aria-label={t('見送る')}><GameIcon name="close" /></button>
    </OrnateFrame>)}</div>}

    {(error || saved.error) && <p className={styles.toast} role="alert">{error ? gameText(error) : t(saved.error)}</p>}
    {!plaza.linked && <p className={styles.toast} role="status">{t('再接続しています…')}</p>}

    {open === 'deckContents' && chosen && <DeckContentsSheet choice={chosen} onClose={() => setOpen(null)} onAction={me && !me.ready ? () => setOpen('deck') : undefined} actionLabel={t('デッキを変更')} />}
    {open === 'deck' && <DeckSheet choices={choices} chosen={chosen} onChoose={id => { choose(id); setOpen(null); }} onClose={() => setOpen(null)}
      onMake={() => { setOpen(null); openAt({ section: 'decks', id: 'new', from: 'seat' }); }} onEdit={id => { setOpen(null); openAt({ section: 'decks', id, from: 'seat' }); }}
      signIn={user ? undefined : () => { signInWithGoogle().catch(() => setError('ログインできませんでした')); }} loading={saved.loading} />}
    {open === 'rules' && <RulesSheet view={view} onClose={() => setOpen(null)} />}
    {open === 'share' && <ShareSheet view={view} onClose={() => setOpen(null)} />}
    {open && typeof open === 'object' && 'opponent' in open && <OpponentSheet onClose={() => setOpen(null)} onInvite={() => setOpen('share')} onCpu={() => setOpen({ cpu: open.opponent })} />}
    {open && typeof open === 'object' && 'cpu' in open && <CpuSheet choices={choices} loading={saved.loading} current={view.players[open.cpu] ?? undefined}
      signIn={user ? undefined : () => { signInWithGoogle().catch(() => setError('ログインできませんでした')); }}
      onClose={() => setOpen(view.players[open.cpu] ? null : { opponent: open.cpu })}
      onChoose={(level, choice) => { const side = open.cpu; setOpen(null); ask({ action: 'cpu', seat: side, level, ...(choice.source !== 'random' && { deck: choice.deck(randomSeed()) }) }); }} />}
    {match && target && <BoardSurfaceContext.Provider value={{ target, root, controlsReady: cameraReady && staged }}>{match.content}</BoardSurfaceContext.Provider>}
  </div>;
}

/** A translated sentence with `{name}` replaced by an element (the name in bold). */
function withName(text: string, name: ReactNode) {
  const [before, after] = text.split('{name}');
  return <>{before}{name}{after}</>;
}

/** Ready, still choosing, or away for a moment; the CPU is always ready. */
function SeatState({ player }: { player: RoomPlayer }) {
  const { t } = useI18n();
  if (player.cpu) {
    const strength = cpuLevels.indexOf(player.cpu);
    return <span className={styles.seatState} data-state="ready" aria-label={t('準備OK・強さ{level}', { level: strength + 1 })}><GameIcon name="check" />
      <span className={styles.stars} aria-hidden="true">{cpuLevels.map((level, star) => <GameIcon key={level} name="star" className={star <= strength ? styles.starOn : styles.starOff} />)}</span></span>;
  }
  if (!player.online) return <span className={styles.seatState} data-state="away">Zzz</span>;
  if (player.ready) return <span className={styles.seatState} data-state="ready"><GameIcon name="check" />OK</span>;
  return <span className={styles.seatState} data-state="choosing"><span className={styles.thinking} aria-label={t('デッキをえらんでいます')}><i /><i /><i /></span></span>;
}

/** The deck's playable, or (おまかせ: made when the match starts) a pile of cards. */
function PlayableArt({ id }: { id?: string }) {
  return id ? <span className={styles.deckPortrait}><CardArtwork id={id} sizes="60px" /></span> : <GameIcon name="cards" />;
}

const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
/**
 * Whether the match's board has been drawn (hidden, while the room still shows) and may be shown: its
 * table is in the surface, its pictures and fonts are decoded and two frames have passed. At most 3 s,
 * so a slow picture never keeps the player in the lobby. Without the camera move it is shown at once.
 */
function useStagedBoard(match: boolean, animate: boolean, root: React.RefObject<HTMLDivElement | null>, target: HTMLDivElement | null) {
  const [staged, setStaged] = useState(false);
  const [wasMatch, setWasMatch] = useState(match);
  if (wasMatch !== match) { setWasMatch(match); if (!match) setStaged(false); }
  useEffect(() => {
    if (!match || staged) return;
    if (!animate) { setStaged(true); return; }
    let cancelled = false;
    const settle = async () => {
      for (let frames = 0; frames < 120 && !target?.querySelector('[data-table]'); frames++) await nextFrame();
      const pictures = [...root.current?.querySelectorAll('img') ?? []];
      await Promise.all([...pictures.map(picture => picture.decode().catch(() => {})), document.fonts.ready]);
      await nextFrame(); await nextFrame();
    };
    void Promise.race([settle(), new Promise(resolve => setTimeout(resolve, 3000))]).then(() => { if (!cancelled) setStaged(true); });
    return () => { cancelled = true; };
  }, [match, animate, staged, root, target]);
  return staged;
}
