'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { DeckKind } from '@pplale/game-core';
import { GameCard } from './GameCard';
import styles from './MulliganBoard.module.css';

type Card = { uid: string; id: string; name: string; deck: DeckKind };
type Zone = DeckKind | 'keep';
type Drag = { uid: string; x: number; y: number; offsetX: number; offsetY: number; moved: boolean; width: number };

export function MulliganBoard({ cards, exchanges, enabled, confirmed, onChange, onConfirm }: {
  cards: Card[]; exchanges: Partial<Record<string, DeckKind>>; enabled: boolean; confirmed: boolean;
  onChange: (uid: string, deck: DeckKind | null) => void; onConfirm: () => void;
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
  const groups: Record<Zone, Card[]> = { yojo: [], sweet: [], keep: [] };
  for (const card of cards) groups[exchanges[card.uid] ?? 'keep'].push(card);
  function position(card: Card) {
    const zone = exchanges[card.uid] ?? 'keep', group = groups[zone], index = group.indexOf(card);
    const gap = Math.min(18, size.width * 0.015);
    const available = zone === 'keep' ? size.width - gap * 4 : size.width / 2 - gap * 3;
    const labelHeight = size.height <= 550 ? 38 : 48;
    const height = size.height * (zone === 'keep' ? 0.49 : 0.45) - labelHeight - 20;
    const width = Math.max(1, Math.min(height * 533 / 800, (available - gap * (group.length - 1)) / group.length));
    const center = zone === 'keep' ? size.width / 2 : size.width * (zone === 'yojo' ? 0.25 : 0.75);
    const x = center - (group.length * width + (group.length - 1) * gap) / 2 + index * (width + gap);
    const y = zone === 'keep' ? size.height * 0.51 + (size.height * 0.49 - labelHeight - width * 800 / 533) / 2 : labelHeight + (size.height * 0.45 - labelHeight - width * 800 / 533) / 2;
    return { x, y, width };
  }
  function zoneAt(x: number, y: number): Zone | null {
    const rect = stage.current?.getBoundingClientRect();
    if (!rect || x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
    if (y - rect.top < rect.height * 0.45) return x - rect.left < rect.width / 2 ? 'yojo' : 'sweet';
    return y - rect.top >= rect.height * 0.51 ? 'keep' : null;
  }
  function pickUp(event: PointerEvent<HTMLButtonElement>, card: Card) {
    if (!enabled || event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    gesture.current = { uid: card.uid, x: event.clientX, y: event.clientY, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, width: rect.width, moved: false };
    suppressClick.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || !enabled || !g.moved && Math.hypot(event.clientX - g.x, event.clientY - g.y) < 8) return;
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
    if (zone && enabled) onChange(g.uid, zone === 'keep' ? null : zone);
  }
  return <section className={styles.overlay} aria-label="初期手札の交換">
    <div ref={stage} className={styles.stage} onPointerMove={move} onPointerUp={release} onPointerCancel={() => { gesture.current = null; setDrag(null); setHover(null); }}>
      <div className={styles.destinations}>{(['yojo', 'sweet'] as const).map(zone => <div key={zone} data-mulligan-zone={zone}
        className={`${styles.zone} ${zone === 'yojo' ? styles.yojo : styles.sweet} ${hover === zone ? styles.hovered : ''}`}>
        <h2>{zone === 'yojo' ? '幼女' : 'お菓子'}</h2>
        {!groups[zone].length && <span className={styles.emptySwap} aria-hidden="true">↻</span>}
      </div>)}</div>
      <div data-mulligan-zone="keep" className={`${styles.keep} ${hover === 'keep' ? styles.hovered : ''}`}><h2>手札</h2></div>
      <span className={styles.upArrow} aria-hidden="true">⌃</span>
      {cards.map(card => {
        const placed = position(card), held = drag?.uid === card.uid;
        const x = held ? drag.x - drag.offsetX : placed.x;
        const y = held ? drag.y - drag.offsetY : placed.y;
        return <button key={card.uid} data-mulligan-card={card.uid} data-hand={card.uid} data-exchange={exchanges[card.uid] ?? 'keep'}
          className={`${styles.card} ${held ? styles.held : ''} ${exchanges[card.uid] ? styles.exchanging : ''}`}
          style={{ width: held ? drag.width : placed.width, transform: `translate3d(${x}px, ${y}px, 0)${held ? ' rotate(-4deg) scale(1.06)' : ''}`, visibility: size.width ? 'visible' : 'hidden' }}
          disabled={!enabled} aria-label={`${card.name}：${exchanges[card.uid] === 'yojo' ? '幼女に交換' : exchanges[card.uid] === 'sweet' ? 'お菓子に交換' : '手札に残す'}`} aria-pressed={!!exchanges[card.uid]}
          onPointerDown={event => pickUp(event, card)}
          onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } onChange(card.uid, exchanges[card.uid] ? null : card.deck); }}
          onKeyDown={event => {
            const zone = event.key === 'ArrowLeft' ? 'yojo' : event.key === 'ArrowRight' ? 'sweet' : event.key === 'ArrowDown' ? 'keep' : null;
            if (zone) { event.preventDefault(); onChange(card.uid, zone === 'keep' ? null : zone); }
          }}><GameCard id={card.id} />{exchanges[card.uid] && <span className={styles.swapBadge} aria-hidden="true">↻</span>}</button>;
      })}
    </div>
    <div className={styles.controls}>
      <button className={styles.confirm} disabled={!enabled || !!drag} onClick={onConfirm} aria-label={confirmed ? '手札確定済み' : '交換するカードを決定'}>{confirmed ? '✓' : '決定'}</button>
      {confirmed && <span className={styles.waiting} role="status" aria-label="相手の準備を待っています"><i /><i /><i /></span>}
    </div>
  </section>;
}
