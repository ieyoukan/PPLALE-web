'use client';

import { useCallback, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { useCardControl } from '@/lib/game/controlSettings';
import { stageRect, toStage } from '../stage/stageSpace';

export type DragSource = 'hand' | 'field';
type Point = { x: number; y: number };
type Gesture = { uid: string; kind: DragSource; x: number; y: number; moved: boolean; canDrag: boolean; scrolled?: boolean; origin: Point; aimed?: Element | null };
/** `aim`: the card stays where it is and a curved arrow runs from it (`origin`) to the pointer. */
export type Held = { uid: string; x: number; y: number; aim: boolean; origin: Point };

const DRAG_THRESHOLD = 10;

/** The arrow from the card to the pointer: a curve rising above both ends (like a thrown card), and the heading at its tip. */
export function aimPath(origin: Point, to: Point) {
  const distance = Math.hypot(to.x - origin.x, to.y - origin.y);
  const control = { x: (origin.x + to.x) / 2, y: Math.min(origin.y, to.y) - distance * .32 };
  return { d: `M${origin.x},${origin.y} Q${control.x},${control.y} ${to.x},${to.y}`, angle: Math.atan2(to.y - control.y, to.x - control.x) * 180 / Math.PI };
}

/** The drop place under the pointer while aiming (`element`; null: none) is marked, and the arrow shows it can be let go. */
function mark(root: HTMLElement | null, g: Gesture, element: Element | null) {
  if (g.aimed === element) return;
  g.aimed?.removeAttribute('data-aimed');
  element?.setAttribute('data-aimed', '');
  g.aimed = element;
  root?.querySelector('[data-aim-arrow]')?.toggleAttribute('data-ready', !!element);
}

/**
 * Pointer dragging of hand and field cards. While held, the card (drag) or the arrow (aim) follows the
 * pointer by writing straight to the DOM (`[data-held-card]`, `[data-aim-arrow]`), so moving does not
 * re-render the board. Positions are in stage pixels (the table may be scaled and turned, see stageSpace).
 * Valid drop places carry `data-aim-ok`; the one under the pointer gets `data-aimed` and the arrow `data-ready`.
 */
export function useCardDrag({ container, canPick, onDragStart, onDrop }: {
  container: RefObject<HTMLDivElement | null>;
  /** null: the card cannot be touched now. canDrag false: it can be tapped but not dragged. */
  canPick: (uid: string, kind: DragSource) => { canDrag: boolean } | null;
  onDragStart: (uid: string, kind: DragSource) => void;
  onDrop: (uid: string, kind: DragSource, target: Element | null) => void;
}) {
  const control = useCardControl();
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const [held, setHeld] = useState<Held | null>(null);


  const pickUp = useCallback((event: ReactPointerEvent<HTMLElement>, uid: string, kind: DragSource) => {
    const allowed = canPick(uid, kind);
    if (!allowed) return;
    const at = toStage(event.clientX, event.clientY), box = stageRect(event.currentTarget);
    gesture.current = { uid, kind, x: at.x, y: at.y, moved: false, canDrag: allowed.canDrag, origin: { x: box.x + box.width / 2, y: box.y + box.height * .35 } };
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
      setHeld({ uid: g.uid, x: at.x, y: at.y, aim: control === 'aim', origin: g.origin });
      onDragStart(g.uid, g.kind);
      return;
    }
    const root = container.current;
    if (control === 'aim') {
      const { d, angle } = aimPath(g.origin, at);
      root?.querySelectorAll('[data-aim-arrow] path[data-aim-line]').forEach(path => path.setAttribute('d', d));
      root?.querySelector('[data-aim-arrow] [data-aim-tip]')?.setAttribute('transform', `translate(${at.x} ${at.y}) rotate(${angle})`);
      mark(root, g, document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-aim-ok]') ?? null);
      return;
    }
    const element = root?.querySelector<HTMLElement>('[data-held-card]');
    if (element) {
      element.style.left = `${at.x}px`;
      element.style.top = `${at.y}px`;
    }
  }, [container, onDragStart, control]);

  const release = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const g = gesture.current;
    gesture.current = null;
    setHeld(null);
    if (!g) return;
    mark(container.current, g, null);
    if (!g.moved && !g.scrolled) return;
    // The pointerup is followed by a click on the same card; ignore that one.
    suppressClick.current = true;
    setTimeout(() => { suppressClick.current = false; }, 0);
    if (g.moved) onDrop(g.uid, g.kind, document.elementFromPoint(event.clientX, event.clientY));
  }, [container, onDrop]);

  const cancel = useCallback(() => {
    if (gesture.current) mark(container.current, gesture.current, null);
    gesture.current = null;
    setHeld(null);
  }, [container]);

  /** True right after a drag, when the trailing click must be ignored. */
  const clickSuppressed = useCallback(() => suppressClick.current, []);
  return { held, pickUp, move, release, cancel, clickSuppressed };
}
