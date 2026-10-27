'use client';

import type { Side } from '@pplale/game-core';
import { useBoardContext } from '../board/BoardContext';
import { CardList } from './MatchInfoPanel';
import { GameCard } from '../GameCard';
import styles from '../BoardEmulator.module.css';

/** Decks expose a sorted multiset of printed cards, never their draw order or instance IDs. */
export function ZonePanel({ side, kind }: { side: Side; kind: 'nap' | 'exile' | 'yojo' | 'sweet' }) {
  const { game, setPanel, mode } = useBoardContext();
  const cards = game.players[side][kind];
  if (kind === 'yojo' || kind === 'sweet') {
    if (mode !== 'puzzle') return null;
    return <>
      <h2>{kind === 'yojo' ? '幼女デッキ' : 'お菓子デッキ'}（{cards.length}枚）</h2>
      <p>残りのカード · 順不同</p>
      <CardList key={`${side}-${kind}`} ids={cards.map(uid => game.cards[uid].cardId)} />
    </>;
  }
  return <>
    <h2>{kind === 'nap' ? 'お昼寝場所' : '除外カード'}（{cards.length}枚）</h2>
    <div className={styles.zoneCards}>{cards.map(uid => <button key={uid} onClick={() => setPanel({ type: 'inspect', uid })}><GameCard id={game.cards[uid].cardId} /></button>)}</div>
  </>;
}
