'use client';

import { useState } from 'react';
import { useBoardContext } from '../board/BoardContext';
import { logTurns } from '../board/matchInfo';
import styles from '../BoardEmulator.module.css';

export function LogPanel() {
  const { game, names } = useBoardContext();
  const [query, setQuery] = useState('');
  const groups = logTurns(game.log, game.players.map(player => player.name));
  return <>
    <h2>対戦ログ</h2>
    <p className={styles.countHint}>新しいターンが上 · 各ターン内は発生順 · 最新100件</p>
    <input className={styles.logSearch} type="search" placeholder="カード名・効果を検索" aria-label="対戦ログを検索" value={query} onChange={event => setQuery(event.target.value)} />
    <div role="log" aria-label="対戦の履歴" aria-live="off">
      {groups.map((group, index) => {
        const lines = group.lines.filter(line => !query.trim() || line.text.includes(query.trim()) || group.title.includes(query.trim()));
        if (query.trim() && !lines.length && !group.title.includes(query.trim())) return null;
        return <section className={styles.logTurn} key={`${index}-${group.title}`} data-side={group.side}>
          <h3>{group.side === undefined ? group.title : `${names[group.side]} · ${group.title.slice(game.players[group.side].name.length + 1)}`}</h3>
          <ol>{lines.map(line => <li className={styles.logEntry} key={line.index}>{line.text}</li>)}</ol>
        </section>;
      })}
      {!game.log.length && <p>対戦が始まると、ここに履歴が表示されます。</p>}
      {!!query.trim() && !game.log.some(line => line.includes(query.trim())) && <p>一致する履歴はありません。</p>}
    </div>
  </>;
}
