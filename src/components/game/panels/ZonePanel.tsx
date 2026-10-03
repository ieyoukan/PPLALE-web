'use client';

import type { Side } from '@pplale/game-core';
import { useBoardContext } from '../board/BoardContext';
import { GameCard } from '../GameCard';
import styles from '../BoardEmulator.module.css';

/** Cards in the nap (お昼寝場所) or exile. */
export function ZonePanel({ side, kind }: { side: Side; kind: 'nap' | 'exile' }) {
  const { game, setPanel } = useBoardContext();
  const cards = game.players[side][kind];
  return <>
    <h2>{kind === 'nap' ? 'お昼寝場所' : '除外カード'}（{cards.length}枚）</h2>
    <div className={styles.zoneCards}>{cards.map(uid => <button key={uid} onClick={() => setPanel({ type: 'inspect', uid })}><GameCard id={game.cards[uid].cardId} /></button>)}</div>
  </>;
}
