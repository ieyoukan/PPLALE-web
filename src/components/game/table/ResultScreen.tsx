'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { cpuProfiles, encodePosition, matchTurns, other } from '@pplale/game-core';
import type { Deck, Side } from '@pplale/game-core';
import { displayCards } from '@/lib/game/catalog';
import { deckNameIn } from '@/lib/game/deckSources';
import { useI18n } from '@/i18n/LocaleProvider';
import { useCardName } from '@/i18n/useCardName';
import { GuestSignInPrompt } from '@/components/shared/auth/GuestSignInPrompt';
import { useBoardContext } from '../board/BoardContext';
import { GameCard } from '../GameCard';
import { outcomeOf, reasonOf } from './outcome';
import type { Outcome } from './outcome';
import { AssessmentGraph } from './Assessment';
import styles from './MatchScreens.module.css';

const tones = { win: styles.resultWin, lose: styles.resultLose, neutral: styles.resultNeutral } as const;

/** After the match: what happened and what to do next (the deck, replay, the game's home, rematch). */
export function ResultScreen() {
  const board = useBoardContext();
  const { t } = useI18n();
  const outcome = outcomeOf(board, t);
  if (!outcome || board.animations.finale || board.replaying) return null;
  return <Result outcome={outcome} />;
}

function Result({ outcome: { winner, kind } }: { outcome: Outcome }) {
  const { game, view, mode, levels, names, setup, remote, position, canRematch, canReplay, rematch, startReplay, leave, editStartingBoard } = useBoardContext();
  const { t, gameText } = useI18n();
  const [deckOpen, setDeckOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  /** The share code of the board this match started from, once asked for (also shown, in case copying is refused). */
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  async function copyCode() {
    if (!position) return;
    const text = encodePosition(position);
    setCode(text);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch { setCopied(false); }
  }
  // Against the CPU the screen is about you; otherwise about whoever won.
  const featured: Side = kind === 'neutral' ? winner : view;
  const foe = other(view), deck = setup?.decks[featured];
  const rows: [string, string][] = [
    [t('決着'), reasonOf(game, names, t)],
    [t('ターン'), t('{count}ターン', { count: matchTurns(game) })],
    [t('お菓子ポイント'), `${t(names[view])} ${game.players[view].points} − ${game.players[foe].points} ${t(names[foe])}`],
    [t('先攻'), t(names[game.rules.firstPlayer])],
    ...(mode === 'cpu' ? [[t('CPUの強さ'), gameText(cpuProfiles[levels[1]].name)] as [string, string]] : []),
  ];
  return <section className={`${styles.result} ${tones[kind]}`} role="dialog" aria-label={t('対戦結果')} data-result-screen>
    <header className={styles.resultHeading}>
      {/* The winner by name: the signed-in user's name when they won. */}
      <h2 className={styles[kind]}>{t('{name}のかち!!', { name: t(names[winner]) })}</h2>
    </header>
    <div className={styles.resultSide}>
      <div className={styles.resultArt}><GameCard id={game.players[featured].playable} sizes="(max-width: 640px) 40vw, 420px" /></div>
      <b className={styles.resultName}>{t(names[featured])}</b>
    </div>
    <div className={styles.resultBody}>
      <div className={styles.resultDetails}>
        <dl className={styles.summary}>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        <ResultAnalysis side={featured} onOpen={() => setAnalysisOpen(true)} />
        {deck && <div className={styles.deckRow}>
          <span>{t('使用デッキ')}</span>
          <button className={styles.plateButton} onClick={() => setDeckOpen(true)}>{t('確認')}</button>
          <strong>{deckNameIn(deck.name, t)}</strong>
        </div>}
        {/* A match played from a board of the 盤面エディタ: that board can be changed again or shared. */}
        {position && <div className={styles.boardRow}>
          <span>{position.title ?? t('作った盤面')}</span>
          <button className={styles.plateButton} onClick={editStartingBoard}>{t('盤面を編集し直す')}</button>
          <button className={styles.plateButton} onClick={() => void copyCode()}>{t('コードをコピー')}</button>
        </div>}
        {code && <label className={styles.boardCode}>
          <span role="status">{t(copied ? '始めの盤面のコードをコピーしました' : 'コピーできませんでした。下から選んでコピーしてください')}</span>
          <textarea readOnly value={code} rows={2} onFocus={event => event.target.select()} />
        </label>}
      </div>
      {!remote?.recorded && !remote?.watching && <GuestSignInPrompt />}
      <div className={styles.actions} role="group" aria-label={t('対戦後の操作')}>
        {canReplay && <button className={styles.plateButton} onClick={startReplay}>{t('リプレイ')}</button>}
        {/* The game's own home (preparation, cards, battles), not the site's top page. */}
        <button className={styles.plateButton} onClick={leave}>{t(remote?.plaza ? remote.watching ? 'テーブルへ' : '席を空けて観戦' : remote?.recorded ? '対戦履歴へ戻る' : remote?.watching ? '観戦をやめる' : remote?.freeMatch ? 'ルームへ戻る' : remote ? 'ルームを出る' : 'ホーム')}</button>
        {canRematch && !remote?.freeMatch && <button className={`${styles.plateButton} ${styles.primaryPlate}`} onClick={rematch}>{t(remote?.plaza ? 'この席でもう一度' : remote ? 'もう一度（デッキ選択へ）' : position ? '同じ盤面でもう一度' : '再戦する')}</button>}
      </div>
    </div>
    {analysisOpen && <ResultSheet title={t('形勢の詳細')} bubble onClose={() => setAnalysisOpen(false)}><AssessmentGraph side={featured} /></ResultSheet>}
    {deck && deckOpen && <DeckSheet deck={deck} onClose={() => setDeckOpen(false)} />}
  </section>;
}

function ResultAnalysis({ side, onOpen }: { side: Side; onOpen: () => void }) {
  const { assessment } = useBoardContext();
  const { t } = useI18n();
  if (assessment.length < 2) return null;
  return <div className={styles.analysis}>
    <AssessmentGraph side={side} compact />
    <button className={styles.plateButton} onClick={onOpen}>{t('形勢の詳細')}</button>
  </div>;
}

/**
 * Keep secondary detail lists out of the result's main actions. `bubble`: 形勢の詳細 — a see-through sheet shaped like a
 * speech bubble (one sharp corner), with no heading shown (the title is only its name for screen readers).
 */
function ResultSheet({ title, bubble = false, onClose, children }: { title: string; bubble?: boolean; onClose: () => void; children: ReactNode }) {
  const sheet = useRef<HTMLDivElement>(null);
  const { t } = useI18n();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    sheet.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => previous?.focus();
  }, []);
  return <div className={styles.deckModal} role="dialog" aria-modal="true" aria-label={title} onClick={onClose} onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    if (event.key === 'Tab') { event.preventDefault(); sheet.current?.querySelector<HTMLButtonElement>('button')?.focus(); }
  }}>
    <div ref={sheet} className={`${styles.deckSheet} ${bubble ? styles.bubbleSheet : ''}`} onClick={event => event.stopPropagation()}>
      <header>{!bubble && <h3>{title}</h3>}<button onClick={onClose} aria-label={t('{title}を閉じる', { title })}>×</button></header>
      {children}
    </div>
  </div>;
}

const counted = (ids: string[]) => Array.from(ids.reduce((counts, id) => counts.set(id, (counts.get(id) ?? 0) + 1), new Map<string, number>()));

/** The cards of the deck that was used, grouped with their counts. */
function DeckSheet({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const { t } = useI18n();
  const cardName = useCardName();
  const groups: [string, [string, number][]][] = [[t('プレイアブル'), [[deck.playable, 1]]], [t('幼女 {count}枚', { count: deck.yojo.length }), counted(deck.yojo)], [t('お菓子 {count}枚', { count: deck.sweet.length }), counted(deck.sweet)]];
  return <div className={styles.deckModal} role="dialog" aria-modal="true" aria-label={t('使用デッキ')} onClick={onClose}>
    <div className={styles.deckSheet} onClick={event => event.stopPropagation()}>
      <header><h3>{deckNameIn(deck.name, t)}</h3><button onClick={onClose} aria-label={t('デッキを閉じる')}>×</button></header>
      {groups.map(([title, cards]) => <section key={title}>
        <h4>{title}</h4>
        <ul className={styles.deckGrid}>{cards.map(([id, count]) => <li key={id} className={styles.deckCard} title={displayCards[id] && cardName(id, displayCards[id].name)}>
          <GameCard id={id} sizes="140px" />
          {count > 1 && <span className={styles.deckCount}>×{count}</span>}
        </li>)}</ul>
      </section>)}
    </div>
  </div>;
}
