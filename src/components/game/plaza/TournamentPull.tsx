'use client';

// The room's tournament, pulled down from the top like a blind: a small trophy tab hangs under the
// table bar, and the bracket drops out of it. Tapping a match being played goes to its table. The owner
// draws a new tournament from the people here, calls a match to a free table again, gives a match to one
// side when it cannot be played, or ends the tournament. Matches are called to tables by the room server
// as soon as both players are free; nobody has to carry the bracket from table to table.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { championOf, matchPlayers, matchState, roundName, TOURNAMENT_SIZE } from '@pplale/game-core/room';
import type { PlazaTournament, PlazaView, RoomAction } from '@pplale/game-core/room';
import type { Side } from '@pplale/game-core';
import { Avatar } from '@/components/shared/player/Avatar';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { useI18n } from '@/i18n/LocaleProvider';
import styles from './TournamentPull.module.css';

export function TournamentPull({ room, roomId, busy, compact = false, iconOf, ask, onLook }: {
  room: PlazaView;
  roomId: string;
  busy: boolean;
  /** Over a match's board (watching): only to look, never to change it. */
  compact?: boolean;
  iconOf: (member?: string, profileId?: string) => string;
  ask: (action: RoomAction) => void;
  onLook: (table: number) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  // The blind drops over the whole room (the tab sits in the header, which is a layer of its own).
  const tab = useRef<HTMLButtonElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const owner = room.owner === room.me && !compact, tournament = room.tournament;
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    addEventListener('keydown', close);
    return () => removeEventListener('keydown', close);
  }, [open]);
  if (!tournament && !owner) return null;
  const champion = tournament ? championOf(tournament) : null;
  return <>
    <button ref={tab} type="button" className={styles.tab} data-compact={compact || undefined} data-open={open || undefined} data-done={champion !== null || undefined}
      aria-expanded={open} aria-label={t('トーナメント')} title={t('トーナメント')}
      onClick={() => { setHost(tab.current?.closest<HTMLElement>('[data-room-view]') ?? null); setOpen(!open); }}>
      <GameIcon name="trophy" />
    </button>
    {open && host && createPortal(<>
    <div className={styles.backdrop} onClick={() => setOpen(false)} />
    <section className={styles.blind} aria-label={t('トーナメント')}>
      {tournament
        ? <Bracket tournament={tournament} room={room} roomId={roomId} owner={owner} busy={busy} iconOf={iconOf} ask={ask} onLook={table => { setOpen(false); onLook(table); }} />
        : <Draw room={room} busy={busy} iconOf={iconOf} onStart={entrants => ask({ action: 'tournament', entrants })} />}
      <button type="button" className={styles.pull} onClick={() => setOpen(false)} aria-label={t('とじる')}><span /></button>
    </section>
    </>, host)}
  </>;
}

/** Choosing who plays: everyone here, chosen by tapping their faces; then the draw. */
function Draw({ room, busy, iconOf, onStart }: { room: PlazaView; busy: boolean; iconOf: (member?: string, profileId?: string) => string; onStart: (entrants: string[]) => void }) {
  const { t, nameText } = useI18n();
  const [left, setLeft] = useState<Set<string>>(() => new Set());
  const chosen = room.members.filter(member => !left.has(member.id)).slice(0, TOURNAMENT_SIZE.max);
  return <div className={styles.draw}>
    <ul className={styles.entrants} aria-label={t('参加する人')}>
      {room.members.map(member => {
        const on = !left.has(member.id);
        return <li key={member.id}>
          <button type="button" aria-pressed={on} onClick={() => setLeft(previous => { const next = new Set(previous); if (on) next.add(member.id); else next.delete(member.id); return next; })}>
            <Avatar card={iconOf(member.id, member.profileId)} size={56} dim={!on} />
            <span>{nameText(member.name)}</span>
            {on && <i className={styles.check}><GameIcon name="check" /></i>}
          </button>
        </li>;
      })}
    </ul>
    <button type="button" className={styles.start} disabled={busy || chosen.length < TOURNAMENT_SIZE.min} onClick={() => onStart(chosen.map(member => member.id))}>
      <GameIcon name="trophy" /><span data-ui-title>{t('抽選してはじめる')}</span><small>{chosen.length}</small>
    </button>
  </div>;
}

/** The bracket: one column per round, each match two rows, lines joining each pair to the match they lead to. */
function Bracket({ tournament, room, roomId, owner, busy, iconOf, ask, onLook }: {
  tournament: PlazaTournament; room: PlazaView; roomId: string; owner: boolean; busy: boolean;
  iconOf: (member?: string, profileId?: string) => string; ask: (action: RoomAction) => void; onLook: (table: number) => void;
}) {
  const { t, nameText } = useI18n();
  const [ending, setEnding] = useState(false);
  // The owner's tools for one match (call it again, give it to one side) show on the match tapped.
  const [picked, setPicked] = useState<string | null>(null);
  const champion = championOf(tournament);
  const here = new Set(room.members.map(member => member.id));
  const entrant = (index: number | null) => index === null ? null : tournament.entrants[index]!;
  return <div className={styles.bracketArea}>
    <div className={styles.bracket} style={{ '--first': tournament.rounds[0].length } as React.CSSProperties}>
      {tournament.rounds.map((matches, round) => <div className={styles.round} key={round} data-last={round === tournament.rounds.length - 1 || undefined}>
        <h3>{t(roundName(tournament, round))}</h3>
        <ol>{matches.map((match, index) => {
          const state = matchState(tournament, round, index), players = matchPlayers(tournament, round, index);
          const started = match.table !== undefined && room.tables?.[match.table]?.status === 'playing';
          const key = `${round}:${index}`, editable = owner && (state === 'ready' || state === 'playing' && !started);
          const tools = editable && picked === key;
          return <li key={index} className={styles.slot}>
            <div className={styles.match} data-state={state} data-picked={tools || undefined}
              {...editable && { role: 'button', tabIndex: 0, 'aria-expanded': tools, 'aria-label': t('この試合を操作する'), onClick: () => setPicked(tools ? null : key), onKeyDown: (event: React.KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setPicked(tools ? null : key); } } }}>
              {players.map((player, side) => {
                const who = entrant(player);
                const outcome = match.winner === null ? undefined : match.winner === side ? 'win' : 'loss';
                // A bye's empty half of the first round; later, a winner not known yet.
                if (!who) return <div key={side} className={styles.player} data-empty>{round === 0 ? '—' : ''}</div>;
                return <div key={side} className={styles.player} data-outcome={outcome} data-self={who.member === room.me || undefined} data-away={!here.has(who.member) || undefined}>
                  <Avatar card={iconOf(who.member, who.profileId)} size={26} />
                  <span>{nameText(who.name)}</span>
                  {outcome === 'win' && <GameIcon name="crown" className={styles.crown} />}
                  {tools && <button type="button" className={styles.give} disabled={busy}
                    onClick={event => { event.stopPropagation(); setPicked(null); ask({ action: 'decide', round, index, winner: side as Side }); }} aria-label={t('{name}の勝ちにする', { name: who.name })} title={t('{name}の勝ちにする', { name: who.name })}><GameIcon name="crown" /></button>}
                </div>;
              })}
              {state === 'playing' && <button type="button" className={styles.goTable} onClick={event => { event.stopPropagation(); onLook(match.table!); }} aria-label={t('卓{n}へ', { n: match.table! + 1 })}>
                <GameIcon name="sword" /><b>{match.table! + 1}</b>
              </button>}
              {tools && <button type="button" className={styles.call} disabled={busy}
                onClick={event => { event.stopPropagation(); setPicked(null); ask({ action: 'callMatch', round, index }); }} aria-label={t('卓に呼ぶ')} title={t('卓に呼ぶ')}><GameIcon name="bell" /></button>}
              {match.matchId && <Link className={styles.replay} href={`/game/replay/?id=${match.matchId}&room=${roomId}`} target="_blank" aria-label={t('リプレイを見る')}><GameIcon name="play" /></Link>}
            </div>
          </li>;
        })}</ol>
      </div>)}
      <div className={styles.championColumn}>
        <div className={styles.champion} data-decided={champion !== null || undefined}>
          <GameIcon name="trophy" />
          {champion !== null && <>
            <Avatar card={iconOf(entrant(champion)!.member, entrant(champion)!.profileId)} size={64} />
            <b>{nameText(entrant(champion)!.name)}</b>
          </>}
        </div>
      </div>
    </div>
    {owner && <div className={styles.ownerTools}>
      {ending
        ? <><button type="button" disabled={busy} onClick={() => ask({ action: 'endTournament' })}><GameIcon name="check" />{t('おわる')}</button><button type="button" onClick={() => setEnding(false)} aria-label={t('やめる')}><GameIcon name="close" /></button></>
        : <button type="button" onClick={() => setEnding(true)}><GameIcon name="exit" />{t('トーナメントをおわる')}</button>}
    </div>}
  </div>;
}
