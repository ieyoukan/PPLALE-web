'use client';

import { useState } from 'react';
import { displayCards, gameCatalog } from '@/lib/game/catalog';
import { sideName, useBoardContext } from '../board/BoardContext';
import { cardCounts, countCards } from '../board/matchInfo';
import { GameCard } from '../GameCard';
import styles from '../BoardEmulator.module.css';

export function CardList({ ids, played }: { ids: string[]; played?: string[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return <div className={styles.matchCardList}>
    {countCards(ids).sort((a, b) => (gameCatalog[a.id]?.cost ?? 0) - (gameCatalog[b.id]?.cost ?? 0) || a.id.localeCompare(b.id, undefined, { numeric: true })).map(({ id, count }) => <button
      key={id} className={expanded === id ? styles.matchCardExpanded : undefined} aria-label={`${displayCards[id]?.name} ${count}枚`} aria-expanded={expanded === id}
      onClick={() => setExpanded(expanded === id ? null : id)}>
      <span className={styles.matchCardFace}><GameCard id={id} sizes="(max-width: 700px) 45vw, 240px" /></span>
      <span>{displayCards[id]?.name}<b>×{count}</b></span>
      {played && <small className={styles.cardPlayed} data-played={played.includes(id)}>{played.includes(id) ? `✓ ${played.filter(cardId => cardId === id).length}回プレイ` : '未プレイ'}</small>}
    </button>)}
  </div>;
}

export function MatchInfoPanel({ kind }: { kind: 'deck' | 'counts' }) {
  const board = useBoardContext();
  const { game, remote, setup, view } = board;
  const fruits = (remote?.matchRules ?? setup?.matchRules)?.fruits;
  if (kind === 'deck') {
    const deck = remote ? !remote.watching && remote.ownDeck : setup?.decks[view];
    return <>
      <h2>自分のデッキ</h2>
      {deck ? <>
        <p>{deck.name} · 対戦開始時の採用カード</p>
        <h3>幼女 · {deck.yojo.length}枚</h3><CardList ids={deck.yojo} played={game.players[remote?.seat ?? view].played} />
        <h3>お菓子 · {deck.sweet.length}枚</h3><CardList ids={deck.sweet} played={game.players[remote?.seat ?? view].played} />
      </> : <p>この対戦のデッキ情報はありません。</p>}
    </>;
  }
  return <>
    <h2>カードのカウント</h2>
    {([view, view === 0 ? 1 : 0] as const).map(side => {
      const player = game.players[side], counts = cardCounts(player, gameCatalog);
      return <section className={styles.matchCountSection} key={side}>
        <h3>{sideName(board, side)}</h3>
        <div className={styles.matchCounts}>
          <div data-ready={counts.uyuchi >= 5}><span>うゆち</span><b>{counts.uyuchi}<small> / 5</small></b><small>{counts.uyuchi >= 5 ? '次から強化' : 'プレイ済み'}</small></div>
          <div><span>お菓子</span><b>{counts.sweets}</b><small>{counts.sweetKinds}種類プレイ済み</small></div>
          {(!fruits || fruits.includes('melon') || counts.mochida > 0) && <div data-ready={counts.mochida >= 10}><span>もちだ</span><b>{counts.mochida}</b><small>場を離れた数</small></div>}
        </div>
        <p className={styles.countHint}>うゆち：イチゴの派生を含む · もちだ：5 / 10体が目安</p>
        <details><summary>プレイ済みカード · {player.played.length}枚</summary>
          {player.played.length ? <CardList ids={player.played} /> : <p>まだプレイしていません</p>}
        </details>
      </section>;
    })}
  </>;
}
