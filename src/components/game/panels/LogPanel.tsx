'use client';

import { useEffect, useRef, useState } from 'react';
import { useBoardContext, usePlayerName } from '../board/BoardContext';
import { logTurns } from '../board/matchInfo';
import styles from '../BoardEmulator.module.css';
import { useI18n } from '@/i18n/LocaleProvider';

export function LogPanel() {
  const { game, names } = useBoardContext();
  const [query, setQuery] = useState('');
  const { t, gameText } = useI18n();
  const playerName = usePlayerName();
  // The engine's lines are shown (and searched) in the reader's language.
  const groups = logTurns(game.log, game.players.map(player => player.name)).map(group => ({
    ...group,
    raw: group.title,
    title: group.side === undefined ? t(group.title) : `${playerName(names[group.side])} · ${t('{n}ターン目', { n: group.title.slice(game.players[group.side].name.length + 1).replace(/\D/g, '') })}`,
    lines: group.lines.map(line => ({ ...line, text: gameText(line.text) })),
  }));
  // Oldest at the top, like a chat: the newest entry is kept in view at the bottom.
  const end = useRef<HTMLDivElement>(null);
  const searching = !!query.trim();
  useEffect(() => { if (!searching) end.current?.scrollIntoView({ block: 'end' }); }, [game.log, searching]);
  return <>
    <h2>{t('対戦ログ')}</h2>
    <p className={styles.countHint}>{t('古い順 · 最新100件')}</p>
    <input className={styles.logSearch} type="search" placeholder={t('カード名・効果を検索')} aria-label={t('対戦ログを検索')} value={query} onChange={event => setQuery(event.target.value)} />
    <div role="log" aria-label={t('対戦の履歴')} aria-live="off">
      {groups.map((group, index) => {
        const titled = group.raw.includes(query.trim()) || group.title.includes(query.trim());
        const lines = group.lines.filter(line => !query.trim() || line.text.includes(query.trim()) || titled);
        if (query.trim() && !lines.length && !titled) return null;
        return <section className={styles.logTurn} key={`${index}-${group.title}`} data-side={group.side}>
          <h3>{group.title}</h3>
          <ol>{lines.map(line => <li className={styles.logEntry} key={line.index}>{line.text}</li>)}</ol>
        </section>;
      })}
      {!game.log.length && <p>{t('対戦が始まると、ここに履歴が表示されます。')}</p>}
      {!!query.trim() && !game.log.some(line => gameText(line).includes(query.trim())) && <p>{t('一致する履歴はありません。')}</p>}
      <div ref={end} />
    </div>
  </>;
}
