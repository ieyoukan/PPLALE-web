'use client';

// A room between matches: its table with two seats on the mat, everyone in the room beside it, the
// rules, and (for whoever sits) the deck and 準備OK. Taking a seat, calling the CPU or getting ready
// are single taps on the table itself; what needs choosing rises as a sheet over it.
import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { cpuLevels, other } from '@pplale/game-core';
import type { Side } from '@pplale/game-core';
import type { RoomAction, RoomPlayer, RoomView } from '@pplale/game-core/room';
import { useAuth } from '@/lib/auth';
import { usableChoice } from '@/lib/game/deckSources';
import { randomSeed } from '@/lib/game/match';
import { fruitArt, roomThumbnail } from '@/lib/game/roomThumbnail';
import { useDeckChoices } from '../DeckSelect';
import { PreparationProgress } from '../MatchPreparation';
import { useRoomPreparation } from '../room/useRoomPreparation';
import { OrnateFrame } from '../ornament/OrnateFrame';
import { Avatar } from './Avatar';
import { CpuSheet, DeckSheet, RulesSheet } from './PlazaSheets';
import { RoomNameSheet } from './RoomManagementSheets';
import { ShareSheet } from './ShareSheet';
import { DiscordMark, PlazaIcon } from './PlazaIcon';
import { usePlaza } from './PlazaProvider';
import { guestIcon, useProfiles } from './useProfiles';
import { visibilityInfo } from './visibility';
import styles from './Plaza.module.css';

const DECK_KEY = 'pplale-plaza-deck-v1';
type Open = null | 'deck' | 'rules' | 'share' | 'name' | { cpu: Side };

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
  const mySeat = mine < 0 ? null : mine as Side, near: Side = mySeat ?? 0;
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
  const preparation = useRoomPreparation(chosen && chosen.source !== 'random' ? chosen.deck(0) : null, view.rules);
  const me = mySeat === null ? null : view.players[mySeat]!;
  const ready = () => { if (chosen) { const deck = chosen.deck(randomSeed()); ask(() => preparation.prepare().then(() => plaza.send({ action: 'ready', deck }))); } };
  const owner = room.members.find(member => member.id === room.owner);
  const seatedCpu = view.players.some(player => player?.cpu);
  const empty = ([0, 1] as const).filter(side => !view.players[side]);
  const info = visibilityInfo[room.visibility];

  /** One seat on the mat: who sits there, or the way to sit there (or to call the CPU). */
  const seat = (side: Side) => {
    const player = view.players[side];
    const position = side === near ? styles.near : styles.far;
    if (!player) return <OrnateFrame size="sm" faint className={`${styles.seat} ${styles.seatEmpty} ${position}`} key={`empty-${side}`}>
      {mySeat === null
        ? <button className={styles.sitButton} disabled={busy} onClick={() => ask({ action: 'sit', seat: side })} aria-label="この席にすわる">
          <span className={styles.plus}><PlazaIcon name="plus" /></span><b data-ui-title>すわる</b>
        </button>
        : <button className={styles.sitButton} disabled={busy} onClick={() => setOpen('share')} aria-label="あいてをさそう">
          <span className={`${styles.plus} ${styles.plusSoft}`}><PlazaIcon name="sparkle" /></span><b data-ui-title>あいて募集中</b>
        </button>}
      {!seatedCpu && <button className={styles.cpuCall} disabled={busy} onClick={() => setOpen({ cpu: side })}><PlazaIcon name="cpu" /><span>CPU</span></button>}
    </OrnateFrame>;
    const self = side === mySeat;
    return <OrnateFrame size="sm" className={`${styles.seat} ${position}`} data-ready={player.ready || undefined} data-self={self || undefined} key={`${player.member ?? player.cpu}-${side}`}>
      <Avatar card={iconOf(player.member, player.profileId)} cpu={!!player.cpu} size={104} dim={!player.online} />
      <span className={styles.seatName}><b data-ui-title>{player.name}</b>{self && <small>あなた</small>}</span>
      <SeatState player={player} />
      {self && <button className={styles.seatCorner} disabled={busy} onClick={() => ask({ action: 'stand' })} aria-label="席を立つ"><PlazaIcon name="stand" /></button>}
      {player.cpu && <button className={styles.seatCorner} disabled={busy} onClick={() => ask({ action: 'dismissCpu' })} aria-label="CPUに帰ってもらう"><PlazaIcon name="close" /></button>}
    </OrnateFrame>;
  };

  return <div className={styles.table} style={{ '--table-art': `url(/images/game/cafe-logo.svg)` } as CSSProperties}>
    <header className={styles.top}>
      <OrnateFrame as="button" size="sm" className={styles.roomPlate} onClick={onMenu} aria-label={`${room.name}（${info.label}）のメニュー`}>
        <span className={styles.roomBadge} data-visibility={room.visibility}><PlazaIcon name={info.icon} />{info.plus && <i>＋</i>}</span>
        <span className={styles.roomTitle}><b data-ui-title>{room.name}</b><small>{info.label}・{room.creator.name}</small></span>
        <span className={styles.count}><PlazaIcon name="people" />{room.members.length}</span>
      </OrnateFrame>
      <div className={styles.topActions}>
        {room.owner === room.me && <button className={styles.round} onClick={() => setOpen('name')} aria-label="ルーム名を変える"><PlazaIcon name="pen" /></button>}
        <button className={styles.inviteButton} onClick={() => setOpen('share')}><DiscordMark /><span data-ui-title>さそう</span></button>
        <button className={styles.round} onClick={onMenu} aria-label="メニュー"><PlazaIcon name="grid" /></button>
      </div>
    </header>

    <OrnateFrame as="aside" tone="cream" className={styles.people} aria-label="ルームにいる人">
      <ul>{room.members.map(member => <li key={member.id} data-away={!member.online || undefined}>
        <MemberLink profileId={member.profileId}>
          <Avatar card={iconOf(member.id, member.profileId)} size={42} dim={!member.online} />
          <span className={styles.personName}>{member.name}{member.id === room.me && <small>あなた</small>}</span>
          <span className={styles.personMarks}>
            {member.id === room.owner && <span className={styles.crown} role="img" aria-label="オーナー"><PlazaIcon name="crown" /></span>}
            {member.seat !== undefined ? <span role="img" aria-label="席にいる"><PlazaIcon name="seat" /></span> : <span role="img" aria-label="観戦"><PlazaIcon name="eye" /></span>}
          </span>
        </MemberLink>
      </li>)}</ul>
    </OrnateFrame>

    <OrnateFrame bare className={styles.mat}>
      <span className={styles.matLogo} aria-hidden="true" />
      {seat(other(near))}
      <span className={styles.vs} aria-hidden="true">VS</span>
      {seat(near)}
    </OrnateFrame>

    <aside className={styles.side}>
      <OrnateFrame as="button" size="sm" className={styles.rulesCard} onClick={() => setOpen('rules')} aria-label="ルール">
        <span className={styles.fruits}>{roomThumbnail(view.rules).fruits.map(fruit => <span key={fruit} style={{ background: fruitArt[fruit].tone }}><Image src={fruitArt[fruit].image} alt="" fill sizes="80px" /></span>)}</span>
        <span className={styles.ruleChips}>
          <span><PlazaIcon name="star" />{view.rules.extendedPlayable ? '拡張' : '通常'}</span>
          <span><PlazaIcon name="timer" />{view.rules.turnSeconds ? `${view.rules.turnSeconds / 60}分` : '∞'}</span>
        </span>
        {room.owner === room.me && <small className={styles.editHint}><PlazaIcon name="pen" />かえる</small>}
      </OrnateFrame>
      {owner ? <span className={styles.ownerChip}><PlazaIcon name="crown" />{owner.id === room.me ? 'あなたがオーナー' : owner.name}</span>
        : <button className={styles.claim} disabled={busy} onClick={() => ask({ action: 'claim' })}><PlazaIcon name="crown" /><span data-ui-title>オーナーになる</span></button>}
    </aside>

    <footer className={styles.actions}>
      {me ? <>
        <OrnateFrame as="button" size="sm" className={styles.deckChip} disabled={me.ready || busy} onClick={() => setOpen('deck')} aria-label={`デッキ: ${chosen?.name ?? 'なし'}`}>
          <span className={styles.deckArt}><PlayableArt id={chosen && chosen.source !== 'random' ? chosen.deck(0).playable : undefined} /></span>
          <span className={styles.deckName}><small>デッキ</small><b>{chosen?.name ?? 'えらぶ'}</b></span>
        </OrnateFrame>
        {me.ready
          ? <button className={`${styles.ready} ${styles.readyDone}`} disabled={busy} onClick={() => ask({ action: 'unready' })}><PlazaIcon name="check" /><span data-ui-title>じゅんびOK</span><small>タップでやめる</small></button>
          : <button className={styles.ready} disabled={busy || !chosen} onClick={ready}><span data-ui-title>{preparation.busy ? 'じゅんび中…' : 'じゅんびOK!'}</span></button>}
        <PreparationProgress progress={preparation.progress} />
      </> : empty.length
        ? <OrnateFrame as="p" size="sm" className={styles.hint}><PlazaIcon name="seat" /><span>空いている席をタップして、対戦にさんか</span></OrnateFrame>
        : <OrnateFrame as="p" size="sm" className={styles.hint}><PlazaIcon name="eye" /><span>席があくのを待っています</span></OrnateFrame>}
    </footer>

    {!!room.requests?.length && <div className={styles.requests} role="region" aria-label="入りたい人">{room.requests.map(request => <OrnateFrame size="sm" key={request.profileId} className={styles.request}>
      <PlazaIcon name="letter" /><span><b>{request.name}</b>が入りたいって</span>
      <button disabled={busy} onClick={() => ask({ action: 'answer', profileId: request.profileId, accept: true })} aria-label={`${request.name}を招待する`}><PlazaIcon name="check" /></button>
      <button disabled={busy} onClick={() => ask({ action: 'answer', profileId: request.profileId, accept: false })} aria-label="見送る"><PlazaIcon name="close" /></button>
    </OrnateFrame>)}</div>}

    {(error || saved.error) && <p className={styles.toast} role="alert">{error || saved.error}</p>}
    {!plaza.linked && <p className={styles.toast} role="status">再接続しています…</p>}

    {open === 'deck' && <DeckSheet choices={choices} chosen={chosen} onChoose={id => { choose(id); setOpen(null); }} onClose={() => setOpen(null)}
      signIn={user ? undefined : () => { signInWithGoogle().catch(() => setError('ログインできませんでした')); }} loading={saved.loading} />}
    {open === 'rules' && <RulesSheet view={view} onClose={() => setOpen(null)} onSave={rules => { setOpen(null); ask({ action: 'rules', rules }); }} />}
    {open === 'name' && <RoomNameSheet view={view} onClose={() => setOpen(null)} />}
    {open === 'share' && <ShareSheet view={view} onClose={() => setOpen(null)} />}
    {open && typeof open === 'object' && <CpuSheet onClose={() => setOpen(null)} onChoose={level => { const side = open.cpu; setOpen(null); ask({ action: 'cpu', seat: side, level }); }} />}
  </div>;
}

/** Ready, still choosing, or away for a moment; the CPU is always ready. */
function SeatState({ player }: { player: RoomPlayer }) {
  if (player.cpu) {
    const strength = cpuLevels.indexOf(player.cpu);
    return <span className={styles.seatState} data-state="ready" aria-label={`準備OK・強さ${strength + 1}`}><PlazaIcon name="check" />
      <span className={styles.stars} aria-hidden="true">{cpuLevels.map((level, star) => <PlazaIcon key={level} name="star" className={star <= strength ? styles.starOn : styles.starOff} />)}</span></span>;
  }
  if (!player.online) return <span className={styles.seatState} data-state="away">Zzz</span>;
  if (player.ready) return <span className={styles.seatState} data-state="ready"><PlazaIcon name="check" />OK</span>;
  return <span className={styles.seatState} data-state="choosing"><span className={styles.thinking} aria-label="デッキをえらんでいます"><i /><i /><i /></span></span>;
}

/** The deck's playable, or (おまかせ: made when the match starts) a pile of cards. */
function PlayableArt({ id }: { id?: string }) {
  return id ? <Avatar card={id} size={60} /> : <PlazaIcon name="cards" />;
}

function MemberLink({ profileId, children }: { profileId?: string; children: ReactNode }) {
  return profileId ? <Link className={styles.person} href={`/game/profile/?id=${encodeURIComponent(profileId)}`} prefetch={false}>{children}</Link> : <span className={styles.person}>{children}</span>;
}
