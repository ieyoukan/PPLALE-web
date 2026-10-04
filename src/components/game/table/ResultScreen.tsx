'use client';

import { useState } from 'react';
import { cpuProfiles, other } from '@pplale/game-core';
import type { Deck, Side } from '@pplale/game-core';
import { displayCards } from '@/lib/game/catalog';
import { useBoardContext } from '../board/BoardContext';
import { GameCard } from '../GameCard';
import { outcomeOf } from './outcome';
import type { Outcome } from './outcome';
import styles from './MatchScreens.module.css';

const tones = { win: styles.resultWin, lose: styles.resultLose, neutral: styles.resultNeutral } as const;

/** After the match: what happened and what to do next (the deck, replay, the game's home, rematch). */
export function ResultScreen() {
  const board = useBoardContext();
  const outcome = outcomeOf(board);
  if (!outcome || board.animations.finale || board.replaying) return null;
  return <Result outcome={outcome} />;
}

function Result({ outcome: { winner, kind } }: { outcome: Outcome }) {
  const { game, view, mode, levels, names, setup, canRematch, canReplay, rematch, startReplay, leave } = useBoardContext();
  const [deckOpen, setDeckOpen] = useState(false);
  // Against the CPU the screen is about you; otherwise about whoever won.
  const featured: Side = kind === 'neutral' ? winner : view;
  const foe = other(view), deck = setup?.decks[featured];
  const rows: [string, string][] = [
    ['決着', game.players[other(winner)].points <= 0 ? 'お菓子ポイントが0になった' : '行動のないターンが続き、お菓子ポイントで判定'],
    // `game.turn` counts every turn of both sides; a player counts their own.
    ['ターン', `${Math.max(game.players[0].turns, game.players[1].turns)}ターン`],
    ['お菓子ポイント', `${names[view]} ${game.players[view].points} − ${game.players[foe].points} ${names[foe]}`],
    ['先攻', names[game.rules.firstPlayer]],
    ...(mode === 'cpu' ? [['CPUの強さ', cpuProfiles[levels[1]].name] as [string, string]] : []),
  ];
  return <section className={`${styles.result} ${tones[kind]}`} role="dialog" aria-label="対戦結果">
    <header className={styles.resultHeading}>
      {/* The winner by name: the signed-in user's name when they won. */}
      <h2 className={styles[kind]}>{names[winner]}のかち!!</h2>
    </header>
    <div className={styles.resultSide}>
      <div className={styles.resultArt}><GameCard id={game.players[featured].playable} sizes="(max-width: 640px) 40vw, 420px" /></div>
      <b className={styles.resultName}>{names[featured]}</b>
    </div>
    <div className={styles.resultBody}>
      <dl className={styles.summary}>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      {deck && <div className={styles.deckRow}>
        <span>使用デッキ</span>
        <button className={styles.plateButton} onClick={() => setDeckOpen(true)}>確認</button>
        <strong>{deck.name}</strong>
      </div>}
      <div className={styles.actions}>
        {canReplay && <button className={styles.plateButton} onClick={startReplay}>リプレイ</button>}
        {/* The game's own home (preparation, cards, battles), not the site's top page. */}
        <button className={styles.plateButton} onClick={leave}>ホーム</button>
        {canRematch && <button className={`${styles.plateButton} ${styles.primaryPlate}`} onClick={rematch}>再戦する</button>}
      </div>
    </div>
    {deck && deckOpen && <DeckSheet deck={deck} onClose={() => setDeckOpen(false)} />}
  </section>;
}

const counted = (ids: string[]) => Array.from(ids.reduce((counts, id) => counts.set(id, (counts.get(id) ?? 0) + 1), new Map<string, number>()));

/** The cards of the deck that was used, grouped with their counts. */
function DeckSheet({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const groups: [string, [string, number][]][] = [['プレイアブル', [[deck.playable, 1]]], [`幼女 ${deck.yojo.length}枚`, counted(deck.yojo)], [`お菓子 ${deck.sweet.length}枚`, counted(deck.sweet)]];
  return <div className={styles.deckModal} role="dialog" aria-modal="true" aria-label="使用デッキ" onClick={onClose}>
    <div className={styles.deckSheet} onClick={event => event.stopPropagation()}>
      <header><h3>{deck.name}</h3><button onClick={onClose} aria-label="デッキを閉じる">×</button></header>
      {groups.map(([title, cards]) => <section key={title}>
        <h4>{title}</h4>
        <ul className={styles.deckGrid}>{cards.map(([id, count]) => <li key={id} className={styles.deckCard} title={displayCards[id]?.name}>
          <GameCard id={id} sizes="140px" />
          {count > 1 && <span className={styles.deckCount}>×{count}</span>}
        </li>)}</ul>
      </section>)}
    </div>
  </div>;
}
