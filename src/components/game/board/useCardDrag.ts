'use client';

import { useCallback, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { toStage } from '../stage/stageSpace';

export type DragSource = 'hand' | 'field';
type Gesture = { uid: string; kind: DragSource; x: number; y: number; moved: boolean; canDrag: boolean; scrolled?: boolean };

const DRAG_THRESHOLD = 10;

/**
 * Pointer dragging of hand and field cards. The held card follows the pointer by writing its
 * position straight to the DOM (`[data-held-card]`), so moving does not re-render the board. Positions
 * are in stage pixels (the table may be scaled and turned, see stageSpace).
 */
export function useCardDrag({ container, canPick, onDragStart, onDrop }: {
  container: RefObject<HTMLDivElement | null>;
  /** null: the card cannot be touched now. canDrag false: it can be tapped but not dragged. */
  canPick: (uid: string, kind: DragSource) => { canDrag: boolean } | null;
  onDragStart: (uid: string, kind: DragSource) => void;
  onDrop: (uid: string, kind: DragSource, target: Element | null) => void;
}) {
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const [held, setHeld] = useState<{ uid: string; x: number; y: number } | null>(null);

  const pickUp = useCallback((event: ReactPointerEvent<HTMLElement>, uid: string, kind: DragSource) => {
    const allowed = canPick(uid, kind);
    if (!allowed) return;
    const at = toStage(event.clientX, event.clientY);
    gesture.current = { uid, kind, x: at.x, y: at.y, moved: false, canDrag: allowed.canDrag };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [canPick]);

  const move = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g) return;
    const at = toStage(event.clientX, event.clientY);
    if (!g.moved && Math.hypot(at.x - g.x, at.y - g.y) < DRAG_THRESHOLD) return;
    // A horizontal touch swipe on the hand scrolls it instead of picking the card up.
    if (event.pointerType === 'touch' && g.kind === 'hand' && !g.moved && Math.abs(at.x - g.x) > Math.abs(at.y - g.y) * 1.2) {
      const list = container.current?.querySelector('[data-hand-list]');
      if (list) list.scrollLeft -= at.x - g.x;
      Object.assign(g, { x: at.x, y: at.y, scrolled: true });
      return;
    }
    if (!g.canDrag) return;
    if (!g.moved) {
      g.moved = true;
      setHeld({ uid: g.uid, x: at.x, y: at.y });
      onDragStart(g.uid, g.kind);
      return;
    }
    const element = container.current?.querySelector<HTMLElement>('[data-held-card]');
    if (element) {
      element.style.left = `${at.x}px`;
      element.style.top = `${at.y}px`;
    }
  }, [container, onDragStart]);

  const release = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const g = gesture.current;
    gesture.current = null;
    setHeld(null);
    if (!g || !g.moved && !g.scrolled) return;
    // The pointerup is followed by a click on the same card; ignore that one.
    suppressClick.current = true;
    setTimeout(() => { suppressClick.current = false; }, 0);
    if (g.moved) onDrop(g.uid, g.kind, document.elementFromPoint(event.clientX, event.clientY));
  }, [onDrop]);

  const cancel = useCallback(() => {
    gesture.current = null;
    setHeld(null);
  }, []);

  /** True right after a drag, when the trailing click must be ignored. */
  const clickSuppressed = useCallback(() => suppressClick.current, []);
  return { held, pickUp, move, release, cancel, clickSuppressed };
}
