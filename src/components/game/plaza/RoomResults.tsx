'use client';

// Who won in this room (戦績): one row per person who played here, most wins first, with their wins and
// losses as marks (newest first). Opening a row lists their matches: against whom, at which table, and
// the replay (anyone in the room may watch it while the room lasts). Kept only while the room lasts; everyone's own history keeps the matches.
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

export function RoomResults({ results, room, me, iconOf }: { results: PlazaResult[]; room: string; me: string; iconOf: (member?: string, profileId?: string) => string }) {
  const { t, nameText } = useI18n();
  const [open, setOpen] = useState<string | null>(null);
  const rows = records(results);
  const said = (outcome: Outcome) => t(outcome === 'win' ? '勝ち' : outcome === 'loss' ? '負け' : '引き分け');
  if (!rows.length) return <p className={styles.empty} role="status" aria-label={t('まだ対戦していません')}><GameIcon name="sword" /></p>;
  return <ol className={styles.records}>
    {rows.map(({ key, player, played, wins, losses }) => {
      const expanded = open === key;
      return <li key={key} data-self={player.member === me || undefined}>
        <button type="button" className={styles.row} aria-expanded={expanded} onClick={() => setOpen(expanded ? null : key)}
          aria-label={`${nameText(player.name)} ${t('{wins}勝{losses}敗', { wins, losses })}`}>
          <Avatar card={iconOf(player.member, player.profileId)} size={36} />
          <span className={styles.name}>{nameText(player.name)}</span>
          {/* Newest on the left, like the list below: wins filled leaf green, losses peach rings. */}
          <span className={styles.marks} aria-hidden="true">{played.slice(0, 10).map(({ result, outcome }) => <i key={result.matchId} data-outcome={outcome} />)}</span>
        </button>
        {expanded && <ul className={styles.matches}>
          {played.map(({ result, outcome, opponent }) => <li key={result.matchId} aria-label={`${said(outcome)} ${t('vs {name}', { name: nameText(opponent.name) })}`}>
            <i className={styles.outcome} data-outcome={outcome} aria-hidden="true" />
            <Avatar card={iconOf(opponent.member, opponent.profileId)} cpu={!!opponent.cpu} size={24} />
            <span className={styles.opponent}>{nameText(opponent.name)}</span>
            {/* In a tab of its own: this one stays in the room meanwhile. */}
            <Link className={styles.replay} href={`/game/replay/?id=${result.matchId}&room=${room}`} target="_blank" aria-label={t('リプレイを見る')}><GameIcon name="play" /></Link>
          </li>)}
        </ul>}
      </li>;
    })}
  </ol>;
}
