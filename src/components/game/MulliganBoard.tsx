'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { DeckKind } from '@pplale/game-core';
import { GameCard } from './GameCard';
import { stageRect, toStage } from './stage/stageSpace';
import styles from './MulliganBoard.module.css';

type Card = { uid: string; id: string; name: string; deck: DeckKind };
type Zone = 'swap' | 'keep';
type Drag = { uid: string; x: number; y: number; offsetX: number; offsetY: number; moved: boolean; width: number };

/**
 * Opening hand exchange: move the cards to give back (of either kind) to the top and confirm.
 * They return to their decks and the replacements are then drawn from the deck stacks on the table.
 */
export function MulliganBoard({ cards, selected, enabled, confirmed, onToggle, onConfirm }: {
  cards: Card[]; selected: string[]; enabled: boolean; confirmed: boolean;
  onToggle: (uid: string, swap: boolean) => void; onConfirm: () => void;
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
    const rect = stage.current && stageRect(stage.current);
    if (!rect || x < rect.x || x > rect.x + rect.width || y < rect.y || y > rect.y + rect.height) return null;
    if (y - rect.y < rect.height * 0.45) return 'swap';
    return y - rect.y >= rect.height * 0.51 ? 'keep' : null;
  }
  const movable = enabled;
  function pickUp(event: PointerEvent<HTMLButtonElement>, card: Card) {
    if (!movable || event.button !== 0) return;
    const rect = stageRect(event.currentTarget), at = toStage(event.clientX, event.clientY);
    gesture.current = { uid: card.uid, x: at.x, y: at.y, offsetX: at.x - rect.x, offsetY: at.y - rect.y, width: rect.width, moved: false };
    suppressClick.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    const at = toStage(event.clientX, event.clientY);
    if (!g || !movable || !g.moved && Math.hypot(at.x - g.x, at.y - g.y) < 8) return;
    const rect = stage.current && stageRect(stage.current);
    if (!rect) return;
    g.moved = true;
    setDrag({ ...g, x: at.x - rect.x, y: at.y - rect.y });
    setHover(zoneAt(at.x, at.y));
  }
  function release(event: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    gesture.current = null; setDrag(null); setHover(null);
    if (!g?.moved) return;
    suppressClick.current = true;
    const at = toStage(event.clientX, event.clientY);
    const zone = zoneAt(at.x, at.y);
    if (zone && movable) onToggle(g.uid, zone === 'swap');
  }
  return <section className={styles.overlay} aria-label="初期手札の交換">
    <div ref={stage} className={styles.stage} onPointerMove={move} onPointerUp={release} onPointerCancel={() => { gesture.current = null; setDrag(null); setHover(null); }}>
      <div className={styles.destinations}><div data-mulligan-zone="swap" className={`${styles.zone} ${styles.swap} ${hover === 'swap' ? styles.hovered : ''}`}>
        <h2>交換する</h2>
        {!groups.swap.length && <span className={styles.emptySwap} aria-hidden="true">↻</span>}
      </div></div>
      <div data-mulligan-zone="keep" className={`${styles.keep} ${hover === 'keep' ? styles.hovered : ''}`}><h2>手札</h2></div>
      <span className={styles.upArrow} aria-hidden="true">⌃</span>
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
      <button className={styles.confirm} disabled={!enabled || !!drag} onClick={onConfirm}
        aria-label={confirmed ? '手札確定済み' : groups.swap.length ? `${groups.swap.length}枚を交換` : '交換せずに決定'}>{confirmed ? '✓' : groups.swap.length ? '交換' : '決定'}</button>
      {confirmed && <span className={styles.waiting} role="status" aria-label="相手の準備を待っています"><i /><i /><i /></span>}
    </div>
  </section>;
}
