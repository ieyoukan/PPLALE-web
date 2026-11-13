'use client';

import { useState } from 'react';
import { displayCards, gameCatalog } from '@/lib/game/catalog';
import { sideName, useBoardContext, usePlayerName } from '../board/BoardContext';
import { cardCounts, countCards } from '../board/matchInfo';
import { GameCard } from '../GameCard';
import styles from '../BoardEmulator.module.css';
import { useI18n } from '@/i18n/LocaleProvider';
import { useCardName } from '@/i18n/useCardName';

export function CardList({ ids, played }: { ids: string[]; played?: string[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const { t } = useI18n();
  const cardName = useCardName();
  const nameOf = (id: string) => cardName(id, displayCards[id]?.name ?? '');
  return <div className={styles.matchCardList}>
    {countCards(ids).sort((a, b) => (gameCatalog[a.id]?.cost ?? 0) - (gameCatalog[b.id]?.cost ?? 0) || a.id.localeCompare(b.id, undefined, { numeric: true })).map(({ id, count }) => <button
      key={id} className={expanded === id ? styles.matchCardExpanded : undefined} aria-label={t('{name} {n}枚', { name: nameOf(id), n: count })} aria-expanded={expanded === id}
      onClick={() => setExpanded(expanded === id ? null : id)}>
      <span className={styles.matchCardFace}><GameCard id={id} sizes="(max-width: 700px) 45vw, 240px" /></span>
      <span>{nameOf(id)}<b>×{count}</b></span>
      {played && <small className={styles.cardPlayed} data-played={played.includes(id)}>{played.includes(id) ? t('✓ {n}回プレイ', { n: played.filter(cardId => cardId === id).length }) : t('未プレイ')}</small>}
    </button>)}
  </div>;
}

export function MatchInfoPanel({ kind }: { kind: 'deck' | 'counts' }) {
  const board = useBoardContext();
  const { t, gameText } = useI18n();
  const playerName = usePlayerName();
  const { game, remote, setup, view } = board;
  const fruits = (remote?.matchRules ?? setup?.matchRules)?.fruits;
  if (kind === 'deck') {
    const deck = remote ? !remote.watching && remote.ownDeck : setup?.decks[view];
    return <>
      <h2>{t('自分のデッキ')}</h2>
      {deck ? <>
        <p>{t('{name} · 対戦開始時の採用カード', { name: gameText(deck.name) })}</p>
        <h3>{t('幼女 · {n}枚', { n: deck.yojo.length })}</h3><CardList ids={deck.yojo} played={game.players[remote?.seat ?? view].played} />
        <h3>{t('お菓子 · {n}枚', { n: deck.sweet.length })}</h3><CardList ids={deck.sweet} played={game.players[remote?.seat ?? view].played} />
      </> : <p>{t('この対戦のデッキ情報はありません。')}</p>}
    </>;
  }
  return <>
    <h2>{t('カードのカウント')}</h2>
    {([view, view === 0 ? 1 : 0] as const).map(side => {
      const player = game.players[side], counts = cardCounts(player, gameCatalog);
      return <section className={styles.matchCountSection} key={side}>
        <h3>{playerName(sideName(board, side))}</h3>
        <div className={styles.matchCounts}>
          <div data-ready={counts.uyuchi >= 5}><span>{t('うゆち')}</span><b>{counts.uyuchi}<small> / 5</small></b><small>{t(counts.uyuchi >= 5 ? '次から強化' : 'プレイ済み')}</small></div>
          <div><span>{t('お菓子')}</span><b>{counts.sweets}</b><small>{t('{n}種類プレイ済み', { n: counts.sweetKinds })}</small></div>
          {(!fruits || fruits.includes('melon') || counts.mochida > 0) && <div data-ready={counts.mochida >= 10}><span>{t('もちだ')}</span><b>{counts.mochida}</b><small>{t('場を離れた数')}</small></div>}
        </div>
        <p className={styles.countHint}>{t('うゆち：イチゴの派生を含む · もちだ：5 / 10体が目安')}</p>
        <details><summary>{t('プレイ済みカード · {n}枚', { n: player.played.length })}</summary>
          {player.played.length ? <CardList ids={player.played} /> : <p>{t('まだプレイしていません')}</p>}
        </details>
      </section>;
    })}
  </>;
}
