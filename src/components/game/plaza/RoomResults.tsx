'use client';

// Who won in this room (戦績): one row per person who played here, most wins first, with their wins and
// losses as marks (newest first). Opening a row lists their matches: against whom, at which table, and
// (one's own) the replay. Kept only while the room lasts; everyone's own history keeps the matches.
import { useState } from 'react';
import Link from 'next/link';
import type { PlazaResult, PlazaResultPlayer } from '@pplale/game-core/room';
import { Avatar } from '@/components/shared/player/Avatar';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { useI18n } from '@/i18n/LocaleProvider';
import styles from './RoomResults.module.css';

type Outcome = 'win' | 'loss' | 'draw';
interface Played { result: PlazaResult; outcome: Outcome; opponent: PlazaResultPlayer }
interface PlayerRecord { key: string; player: PlazaResultPlayer; played: Played[]; wins: number; losses: number }

/** Each person's matches here, newest first; CPUs only as opponents. */
function records(results: PlazaResult[]): PlayerRecord[] {
  const byPlayer = new Map<string, PlayerRecord>();
  for (const result of [...results].reverse()) for (const side of [0, 1] as const) {
    const player = result.players[side];
    if (player.cpu) continue;
    const key = player.member ?? `name:${player.name}`;
    let entry = byPlayer.get(key);
    if (!entry) byPlayer.set(key, entry = { key, player, played: [], wins: 0, losses: 0 });
    const outcome: Outcome = result.winner === null ? 'draw' : result.winner === side ? 'win' : 'loss';
    entry.played.push({ result, outcome, opponent: result.players[1 - side] });
    if (outcome === 'win') entry.wins++;
    if (outcome === 'loss') entry.losses++;
  }
  return [...byPlayer.values()].sort((a, b) => b.wins - a.wins || a.losses - b.losses || b.played.length - a.played.length);
}

export function RoomResults({ results, me, iconOf }: { results: PlazaResult[]; me: string; iconOf: (member?: string, profileId?: string) => string }) {
  const { t, nameText } = useI18n();
  const [open, setOpen] = useState<string | null>(null);
  const rows = records(results);
  if (!rows.length) return <p className={styles.empty}><GameIcon name="sword" />{t('まだ対戦していません')}</p>;
  return <ol className={styles.records}>
    {rows.map(({ key, player, played, wins, losses }) => {
      const expanded = open === key;
      return <li key={key} data-self={player.member === me || undefined}>
        <button type="button" className={styles.row} aria-expanded={expanded} onClick={() => setOpen(expanded ? null : key)}>
          <Avatar card={iconOf(player.member, player.profileId)} size={36} />
          <span className={styles.name}>{nameText(player.name)}</span>
          <span className={styles.score} aria-label={t('{wins}勝{losses}敗', { wins, losses })}><b>{wins}</b><small>{t('勝')}</small><b>{losses}</b><small>{t('敗')}</small></span>
          {/* Newest on the left, like the list below. */}
          <span className={styles.marks} aria-hidden="true">{played.slice(0, 8).map(({ result, outcome }) => <i key={result.matchId} data-outcome={outcome} />)}</span>
        </button>
        {expanded && <ul className={styles.matches}>
          {played.map(({ result, outcome, opponent }) => <li key={result.matchId}>
            <span className={styles.outcome} data-outcome={outcome}>{t(outcome === 'win' ? '勝ち' : outcome === 'loss' ? '負け' : '引き分け')}</span>
            <span className={styles.opponent}>{t('vs {name}', { name: nameText(opponent.name) })}</span>
            <small>{t('卓{n}', { n: result.table + 1 })}</small>
            {player.member === me && <Link className={styles.replay} href={`/game/replay/?id=${result.matchId}`} aria-label={t('リプレイを見る')}><GameIcon name="play" /></Link>}
          </li>)}
        </ul>}
      </li>;
    })}
  </ol>;
}
