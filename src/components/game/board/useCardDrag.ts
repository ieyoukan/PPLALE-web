'use client';

import { useCallback, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';

export type DragSource = 'hand' | 'field';
type Gesture = { uid: string; kind: DragSource; x: number; y: number; moved: boolean; canDrag: boolean; scrolled?: boolean };

const DRAG_THRESHOLD = 10;

/**
 * Pointer dragging of hand and field cards. The held card follows the pointer by writing its
 * position straight to the DOM (`[data-held-card]`), so moving does not re-render the board.
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
    gesture.current = { uid, kind, x: event.clientX, y: event.clientY, moved: false, canDrag: allowed.canDrag };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [canPick]);

  const move = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g || !g.moved && Math.hypot(event.clientX - g.x, event.clientY - g.y) < DRAG_THRESHOLD) return;
    // A horizontal touch swipe on the hand scrolls it instead of picking the card up.
    if (event.pointerType === 'touch' && g.kind === 'hand' && !g.moved && Math.abs(event.clientX - g.x) > Math.abs(event.clientY - g.y) * 1.2) {
      const list = container.current?.querySelector('[data-hand-list]');
      if (list) list.scrollLeft -= event.clientX - g.x;
      Object.assign(g, { x: event.clientX, y: event.clientY, scrolled: true });
      return;
    }
    if (!g.canDrag) return;
    if (!g.moved) {
      g.moved = true;
      setHeld({ uid: g.uid, x: event.clientX, y: event.clientY });
      onDragStart(g.uid, g.kind);
      return;
    }
    const element = container.current?.querySelector<HTMLElement>('[data-held-card]');
    if (element) {
      element.style.left = `${event.clientX}px`;
      element.style.top = `${event.clientY}px`;
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
