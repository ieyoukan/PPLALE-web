'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { DeckKind } from '@pplale/game-core';
import { GameCard } from './GameCard';
import styles from './MulliganBoard.module.css';

type Card = { uid: string; id: string; name: string; deck: DeckKind };
type Zone = 'swap' | 'keep';
type Drag = { uid: string; x: number; y: number; offsetX: number; offsetY: number; moved: boolean; width: number };

/**
 * Opening hand exchange in two steps: move the cards to give back (of either kind) to the top and
 * confirm; then draw that many replacements, each from the deck of your choice.
 */
export function MulliganBoard({ cards, selected, remaining, deckCounts, enabled, confirmed, onToggle, onConfirm, onDraw }: {
  cards: Card[]; selected: string[]; remaining: number; deckCounts: Record<DeckKind, number>; enabled: boolean; confirmed: boolean;
  onToggle: (uid: string, swap: boolean) => void; onConfirm: () => void; onDraw: (deck: DeckKind) => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const gesture = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<Zone | null>(null);
  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const drawing = remaining > 0;
  const zoneOf = (card: Card): Zone => selected.includes(card.uid) ? 'swap' : 'keep';
  const groups: Record<Zone, Card[]> = { swap: [], keep: [] };
  for (const card of cards) groups[zoneOf(card)].push(card);
  function position(card: Card) {
    const zone = zoneOf(card), group = groups[zone], index = group.indexOf(card);
    const gap = Math.min(18, size.width * 0.015);
    const available = size.width - gap * 4;
    const labelHeight = size.height <= 550 ? 38 : 48;
    const height = size.height * (zone === 'keep' ? 0.49 : 0.45) - labelHeight - 20;
    const width = Math.max(1, Math.min(height * 533 / 800, (available - gap * (group.length - 1)) / group.length));
    const x = size.width / 2 - (group.length * width + (group.length - 1) * gap) / 2 + index * (width + gap);
    const y = zone === 'keep' ? size.height * 0.51 + (size.height * 0.49 - labelHeight - width * 800 / 533) / 2 : labelHeight + (size.height * 0.45 - labelHeight - width * 800 / 533) / 2;
    return { x, y, width };
  }
  function zoneAt(x: number, y: number): Zone | null {
    const rect = stage.current?.getBoundingClientRect();
    if (!rect || x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
    if (y - rect.top < rect.height * 0.45) return 'swap';
    return y - rect.top >= rect.height * 0.51 ? 'keep' : null;
  }
  const movable = enabled && !drawing;
  function pickUp(event: PointerEvent<HTMLButtonElement>, card: Card) {
    if (!movable || event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    gesture.current = { uid: card.uid, x: event.clientX, y: event.clientY, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, width: rect.width, moved: false };
    suppressClick.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || !movable || !g.moved && Math.hypot(event.clientX - g.x, event.clientY - g.y) < 8) return;
    const rect = stage.current?.getBoundingClientRect();
    if (!rect) return;
    g.moved = true;
    setDrag({ ...g, x: event.clientX - rect.left, y: event.clientY - rect.top });
    setHover(zoneAt(event.clientX, event.clientY));
  }
  function release(event: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    gesture.current = null; setDrag(null); setHover(null);
    if (!g?.moved) return;
    suppressClick.current = true;
    const zone = zoneAt(event.clientX, event.clientY);
    if (zone && movable) onToggle(g.uid, zone === 'swap');
  }
  return <section className={styles.overlay} aria-label="初期手札の交換">
    <div ref={stage} className={styles.stage} onPointerMove={move} onPointerUp={release} onPointerCancel={() => { gesture.current = null; setDrag(null); setHover(null); }}>
      {drawing
        // Step 2: one replacement per press, from either deck.
        ? <div className={styles.destinations}>{(['yojo', 'sweet'] as const).map(deck => <button key={deck} data-mulligan-deck={deck}
          className={`${styles.zone} ${styles.deckChoice} ${deck === 'yojo' ? styles.yojo : styles.sweet}`}
          disabled={!enabled || !deckCounts[deck]} onClick={() => onDraw(deck)}>
          <h2>{deck === 'yojo' ? '幼女から引く' : 'お菓子から引く'}</h2>
          <span className={styles.deckBack} aria-hidden="true" />
          <small>残り{deckCounts[deck]}枚</small>
        </button>)}</div>
        // Step 1: the cards to give back, whatever their kind.
        : <div className={styles.destinations}><div data-mulligan-zone="swap" className={`${styles.zone} ${styles.swap} ${hover === 'swap' ? styles.hovered : ''}`}>
          <h2>交換する</h2>
          {!groups.swap.length && <span className={styles.emptySwap} aria-hidden="true">↻</span>}
        </div></div>}
      <div data-mulligan-zone="keep" className={`${styles.keep} ${hover === 'keep' ? styles.hovered : ''}`}><h2>{drawing ? `あと${remaining}枚引く` : '手札'}</h2></div>
      {!drawing && <span className={styles.upArrow} aria-hidden="true">⌃</span>}
      {cards.map(card => {
        const placed = position(card), held = drag?.uid === card.uid, swap = zoneOf(card) === 'swap';
        const x = held ? drag.x - drag.offsetX : placed.x;
        const y = held ? drag.y - drag.offsetY : placed.y;
        return <button key={card.uid} data-mulligan-card={card.uid} data-hand={card.uid} data-exchange={swap ? 'swap' : 'keep'}
          className={`${styles.card} ${held ? styles.held : ''} ${swap ? styles.exchanging : ''}`}
          style={{ width: held ? drag.width : placed.width, transform: `translate3d(${x}px, ${y}px, 0)${held ? ' rotate(-4deg) scale(1.06)' : ''}`, visibility: size.width ? 'visible' : 'hidden' }}
          disabled={!movable} aria-label={`${card.name}：${swap ? '交換する' : '手札に残す'}`} aria-pressed={swap}
          onPointerDown={event => pickUp(event, card)}
          onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } onToggle(card.uid, !swap); }}
          onKeyDown={event => {
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); onToggle(card.uid, event.key === 'ArrowUp'); }
          }}><GameCard id={card.id} sizes="(max-width: 700px) 22vw, 240px" />{swap && <span className={styles.swapBadge} aria-hidden="true">↻</span>}</button>;
      })}
    </div>
    <div className={styles.controls}>
      <button className={styles.confirm} disabled={!enabled || drawing || !!drag} onClick={onConfirm}
        aria-label={confirmed ? '手札確定済み' : groups.swap.length ? `${groups.swap.length}枚を交換` : '交換せずに決定'}>{confirmed ? '✓' : groups.swap.length ? '交換' : '決定'}</button>
      {confirmed && <span className={styles.waiting} role="status" aria-label="相手の準備を待っています"><i /><i /><i /></span>}
    </div>
  </section>;
}
