'use client';

// A room between matches: its table with two seats on the mat, everyone in the room beside it, the
// rules, and (for whoever sits) the deck and 準備OK. Taking a seat, calling the CPU or getting ready
// are single taps on the table itself; what needs choosing rises as a sheet over it.
// The table stands in the room in 3D with the match's board lying on it, seen from its side: a seat
// at each end. Upright seat controls sit above it. When the match starts the board comes round, the player's seat to
// the front, and is looked down on from above.
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { cpuLevels } from '@pplale/game-core';
import type { Side } from '@pplale/game-core';
import type { RoomAction, RoomPlayer, RoomView } from '@pplale/game-core/room';
import { useAuth } from '@/lib/auth';
import { usableChoice } from '@/lib/game/deckSources';
import { randomSeed } from '@/lib/game/match';
import { useDeckChoices } from '../DeckSelect';
import { useRoomPreparation } from '../room/useRoomPreparation';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
import { Avatar } from '@/components/shared/player/Avatar';
import { CardArtwork } from '@/components/shared/card/CardArtwork';
import { BoardSurface } from './BoardSurface';
import { DeckContentsSheet, DeckSheet, OpponentSheet, RulesSheet } from './PlazaSheets';
import { CpuSheet } from './CpuSheet';
import { RoomNameSheet } from './RoomManagementSheets';
import { RoomThumbnailImage } from './RoomThumbnailImage';
import { ShareSheet } from './ShareSheet';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { usePlaza } from './PlazaProvider';
import { guestIcon, useProfiles } from '@/components/shared/player/useProfiles';
import { visibilityInfo } from './visibility';
import styles from './Plaza.module.css';

const DECK_KEY = 'pplale-plaza-deck-v1';
type Open = null | 'deck' | 'deckContents' | 'rules' | 'share' | 'name' | { opponent: Side } | { cpu: Side };

/** The deck this browser chose last, so the next match starts with it already chosen. */
function useChosenDeck() {
  const [selected, setSelected] = useState('');
  useEffect(() => { try { setSelected(localStorage.getItem(DECK_KEY) ?? ''); } catch { /* Chosen anew each time. */ } }, []);
  const choose = (id: string) => { setSelected(id); try { localStorage.setItem(DECK_KEY, id); } catch { /* Kept for this visit. */ } };
  return [selected, choose] as const;
}

export function PlazaTable({ view, onMenu }: { view: RoomView; onMenu: () => void }) {
  const plaza = usePlaza(), room = view.plaza!;
  const { user, signInWithGoogle } = useAuth();
  const mine = view.players.findIndex(player => player?.member === room.me);
  const mySeat = mine < 0 ? null : mine as Side;
  const profiles = useProfiles([...room.members.map(member => member.profileId), ...view.players.map(player => player?.profileId)]);
  const iconOf = (member?: string, profileId?: string) => profileId && profiles[profileId] ? profiles[profileId].iconCardId : guestIcon(member ?? '');
  const [open, setOpen] = useState<Open>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const ask = (action: RoomAction | (() => Promise<void>)) => {
    setBusy(true); setError('');
    (typeof action === 'function' ? action() : plaza.send(action))
      .catch((failure: unknown) => setError(failure instanceof Error ? failure.message : '送れませんでした'))
      .finally(() => setBusy(false));
  };

  const [selected, choose] = useChosenDeck();
  const { choices, saved } = useDeckChoices(view.rules, 'このルーム');
  const chosen = usableChoice(choices, selected);
  // The match's cards and code load in the background meanwhile; getting ready does not wait for them.
  useRoomPreparation(chosen && chosen.source !== 'random' ? chosen.deck(0) : null, view.rules);
  const me = mySeat === null ? null : view.players[mySeat]!;
  const ready = () => { if (chosen) ask({ action: 'ready', deck: chosen.deck(randomSeed()) }); };
  const owner = room.members.find(member => member.id === room.owner);
  const empty = ([0, 1] as const).filter(side => !view.players[side]);
  const info = visibilityInfo[room.visibility];

  /** One seat on the mat: who sits there, or the way to sit there (or to call the CPU). */
  const seat = (side: Side) => {
    const player = view.players[side];
    if (!player) return <OrnateFrame size="sm" faint className={`${styles.seat} ${styles.seatEmpty}`} key={`empty-${side}`}>
      {mySeat === null
        ? <button className={styles.sitButton} disabled={busy} onClick={() => ask({ action: 'sit', seat: side })} aria-label="この席にすわる">
          <span className={styles.plus}><GameIcon name="plus" /></span><b data-ui-title>すわる</b>
        </button>
        : <button className={styles.sitButton} disabled={busy} onClick={() => setOpen({ opponent: side })} aria-label="対戦相手をえらぶ">
          <span className={`${styles.plus} ${styles.plusSoft}`}><GameIcon name="people" /></span><b data-ui-title>相手をえらぶ</b>
        </button>}
    </OrnateFrame>;
    const self = side === mySeat;
    return <div className={`${styles.seat} ${styles.playerSeat}`} data-ready={player.ready || undefined} data-self={self || undefined} key={`${player.member ?? player.cpu}-${side}`}>
      <Avatar card={iconOf(player.member, player.profileId)} cpu={!!player.cpu} size={104} dim={!player.online} />
      <span className={styles.seatName}><b data-ui-title>{player.name}</b>{self && <small>あなた</small>}</span>
      {!self && <SeatState player={player} />}
      {self && me && <div className={styles.seatActions}>
        <OrnateFrame as="button" size="sm" className={styles.deckChip} disabled={busy} onClick={() => setOpen(me.ready && chosen ? 'deckContents' : 'deck')} aria-label={`デッキ: ${chosen?.name ?? 'なし'}`}>
          <span className={styles.deckArt}><PlayableArt id={chosen && chosen.source !== 'random' ? chosen.deck(0).playable : undefined} /></span>
          <span className={styles.deckName}><small>デッキ</small><b>{chosen?.name ?? 'えらぶ'}</b></span>
        </OrnateFrame>
        {me.ready
          ? <OrnateFrame as="button" size="line" className={`${styles.ready} ${styles.readyDone}`} disabled={busy} onClick={() => ask({ action: 'unready' })}><GameIcon name="check" /><span data-ui-title>じゅんびOK</span></OrnateFrame>
          : <OrnateFrame as="button" size="line" className={styles.ready} disabled={busy || !chosen} onClick={ready}><span data-ui-title>じゅんびOK!</span></OrnateFrame>}
      </div>}
      {self && <button className={styles.leaveSeat} disabled={busy} onClick={() => ask({ action: 'stand' })} aria-label="席を立つ"><GameIcon name="exit" /><span data-ui-title>席を立つ</span></button>}
      {player.cpu && <div className={styles.seatActions}><OrnateFrame as="button" size="sm" className={styles.deckChip} disabled={busy} onClick={() => setOpen({ cpu: side })} aria-label={`CPUのデッキ: ${player.deck ?? 'おまかせデッキ'}`}>
        <span className={styles.deckArt}><GameIcon name="cards" /></span><span className={styles.deckName}><small>CPUのデッキ</small><b>{player.deck ?? 'おまかせデッキ'}</b></span>
      </OrnateFrame></div>}
      {player.cpu && <button className={styles.seatCorner} disabled={busy} onClick={() => ask({ action: 'dismissCpu' })} aria-label="CPUに帰ってもらう"><GameIcon name="close" /></button>}
    </div>;
  };

  return <div className={styles.table}>
    <header className={styles.top}>
      <OrnateFrame as="button" size="sm" className={styles.roomPlate} onClick={onMenu} aria-label={`${room.name}（${info.label}）のメニュー`}>
        <span className={styles.roomBadge} data-visibility={room.visibility}><GameIcon name={info.icon} />{info.plus && <i>＋</i>}</span>
        <span className={styles.roomTitle}><b data-ui-title>{room.name}</b><small>{info.label}・{room.creator.name}</small></span>
        <span className={styles.count}><GameIcon name="people" />{room.members.length}</span>
      </OrnateFrame>
      <div className={styles.topActions}>
        {room.owner === room.me && <button className={styles.round} onClick={() => setOpen('name')} aria-label="ルーム名を変える"><GameIcon name="pen" /></button>}
        <button className={styles.inviteButton} onClick={() => setOpen('share')}><GameIcon name="letter" /><span data-ui-title>さそう</span></button>
        <button className={styles.round} onClick={onMenu} aria-label="メニュー"><GameIcon name="grid" /></button>
      </div>
    </header>

    <OrnateFrame as="aside" tone="cream" className={styles.people} aria-label="ルームにいる人">
      <ul>{room.members.map(member => <li key={member.id} data-away={!member.online || undefined}>
        <MemberLink profileId={member.profileId}>
          <Avatar card={iconOf(member.id, member.profileId)} size={42} dim={!member.online} />
          <span className={styles.personName}>{member.name}{member.id === room.me && <small>あなた</small>}</span>
          <span className={styles.personMarks}>
            {member.id === room.owner && <span className={styles.crown} role="img" aria-label="オーナー"><GameIcon name="crown" /></span>}
            {member.seat !== undefined ? <span role="img" aria-label="席にいる"><GameIcon name="seat" /></span> : <span role="img" aria-label="観戦"><GameIcon name="eye" /></span>}
          </span>
        </MemberLink>
      </li>)}</ul>
    </OrnateFrame>

    <div className={styles.mat}>
      {/* The board with seat 0's half nearest, turned a quarter so seat 0 is at the left end and seat 1 at the right. */}
      <div className={styles.tableTop}>
        <span className={styles.floorShadow} aria-hidden="true" />
        <BoardSurface className={styles.surface} />
        <span className={styles.light} aria-hidden="true" />
      </div>
        {([0, 1] as const).map(side => <div key={side} className={styles.spot} data-seat={side}>
          <span className={styles.shadow} aria-hidden="true" />
          <div className={styles.stand}>{seat(side)}</div>
        </div>)}
    </div>

    <aside className={styles.side}>
      <OrnateFrame as="button" size="sm" className={styles.rulesCard} onClick={() => setOpen('rules')} aria-label="ルール">
        <RoomThumbnailImage rules={view.rules} alt="ルームのルール" className={styles.rulesThumbnail} sizes="180px" />
        <span className={styles.ruleChips}>
          <span><GameIcon name="star" />{view.rules.extendedPlayable ? '拡張' : '通常'}</span>
          <span><GameIcon name="timer" />{view.rules.turnSeconds ? `${view.rules.turnSeconds / 60}分` : '∞'}</span>
        </span>
        {room.owner === room.me && <small className={styles.editHint}><GameIcon name="pen" />ルールをかえる</small>}
      </OrnateFrame>
      {owner ? <span className={styles.ownerChip}><GameIcon name="crown" />{owner.id === room.me ? 'あなたがオーナー' : owner.name}</span>
        : <button className={styles.claim} disabled={busy} onClick={() => ask({ action: 'claim' })}><GameIcon name="crown" /><span data-ui-title>オーナーになる</span></button>}
    </aside>

    {!me && empty.length === 0 && <footer className={styles.actions}>
      <OrnateFrame as="p" size="sm" className={styles.hint}><GameIcon name="eye" /><span>席があくのを待っています</span></OrnateFrame>
    </footer>}

    {!!room.requests?.length && <div className={styles.requests} role="region" aria-label="入りたい人">{room.requests.map(request => <OrnateFrame size="sm" key={request.profileId} className={styles.request}>
      <GameIcon name="letter" /><span><b>{request.name}</b>が入りたいって</span>
      <button disabled={busy} onClick={() => ask({ action: 'answer', profileId: request.profileId, accept: true })} aria-label={`${request.name}を招待する`}><GameIcon name="check" /></button>
      <button disabled={busy} onClick={() => ask({ action: 'answer', profileId: request.profileId, accept: false })} aria-label="見送る"><GameIcon name="close" /></button>
    </OrnateFrame>)}</div>}

    {(error || saved.error) && <p className={styles.toast} role="alert">{error || saved.error}</p>}
    {!plaza.linked && <p className={styles.toast} role="status">再接続しています…</p>}

    {open === 'deckContents' && chosen && <DeckContentsSheet choice={chosen} onClose={() => setOpen(null)} onAction={me && !me.ready ? () => setOpen('deck') : undefined} actionLabel="デッキを変更" />}
    {open === 'deck' && <DeckSheet choices={choices} chosen={chosen} onChoose={id => { choose(id); setOpen(null); }} onClose={() => setOpen(null)}
      signIn={user ? undefined : () => { signInWithGoogle().catch(() => setError('ログインできませんでした')); }} loading={saved.loading} />}
    {open === 'rules' && <RulesSheet view={view} onClose={() => setOpen(null)} onSave={rules => { setOpen(null); ask({ action: 'rules', rules }); }} />}
    {open === 'name' && <RoomNameSheet view={view} onClose={() => setOpen(null)} />}
    {open === 'share' && <ShareSheet view={view} onClose={() => setOpen(null)} />}
    {open && typeof open === 'object' && 'opponent' in open && <OpponentSheet onClose={() => setOpen(null)} onInvite={() => setOpen('share')} onCpu={() => setOpen({ cpu: open.opponent })} />}
    {open && typeof open === 'object' && 'cpu' in open && <CpuSheet choices={choices} loading={saved.loading} current={view.players[open.cpu] ?? undefined}
      signIn={user ? undefined : () => { signInWithGoogle().catch(() => setError('ログインできませんでした')); }}
      onClose={() => setOpen(view.players[open.cpu] ? null : { opponent: open.cpu })}
      onChoose={(level, choice) => { const side = open.cpu; setOpen(null); ask({ action: 'cpu', seat: side, level, ...(choice.source !== 'random' && { deck: choice.deck(randomSeed()) }) }); }} />}
  </div>;
}

/** Ready, still choosing, or away for a moment; the CPU is always ready. */
function SeatState({ player }: { player: RoomPlayer }) {
  if (player.cpu) {
    const strength = cpuLevels.indexOf(player.cpu);
    return <span className={styles.seatState} data-state="ready" aria-label={`準備OK・強さ${strength + 1}`}><GameIcon name="check" />
      <span className={styles.stars} aria-hidden="true">{cpuLevels.map((level, star) => <GameIcon key={level} name="star" className={star <= strength ? styles.starOn : styles.starOff} />)}</span></span>;
  }
  if (!player.online) return <span className={styles.seatState} data-state="away">Zzz</span>;
  if (player.ready) return <span className={styles.seatState} data-state="ready"><GameIcon name="check" />OK</span>;
  return <span className={styles.seatState} data-state="choosing"><span className={styles.thinking} aria-label="デッキをえらんでいます"><i /><i /><i /></span></span>;
}

/** The deck's playable, or (おまかせ: made when the match starts) a pile of cards. */
function PlayableArt({ id }: { id?: string }) {
  return id ? <span className={styles.deckPortrait}><CardArtwork id={id} sizes="60px" /></span> : <GameIcon name="cards" />;
}

function MemberLink({ profileId, children }: { profileId?: string; children: ReactNode }) {
  return profileId ? <Link className={styles.person} href={`/game/profile/?id=${encodeURIComponent(profileId)}`} prefetch={false}>{children}</Link> : <span className={styles.person}>{children}</span>;
}
