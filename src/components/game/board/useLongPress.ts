'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { MouseEvent, PointerEvent } from 'react';

const LONG_PRESS = 450;
const SLOP = 8;

/**
 * Touch and hold (the right click of a touch screen): `action` runs after LONG_PRESS unless the finger
 * moves or lifts first, and the click that ends the press is swallowed. While held, the element carries
 * `data-pressing` so it can grow towards the enlarged card. Mouse pointers keep their right click.
 */
export function useLongPress() {
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number; element: HTMLElement } | null>(null);
  const fired = useRef(false);
  const clear = useCallback(() => {
    if (!press.current) return;
    clearTimeout(press.current.timer);
    delete press.current.element.dataset.pressing;
    press.current = null;
  }, []);
  useEffect(() => clear, [clear]);

  return useCallback((action: () => void) => ({
    onPointerDown(event: PointerEvent<HTMLElement>) {
      clear();
      fired.current = false;
      if (event.pointerType === 'mouse') return;
      const element = event.currentTarget;
      element.dataset.pressing = '';
      press.current = { x: event.clientX, y: event.clientY, element, timer: setTimeout(() => { clear(); fired.current = true; action(); }, LONG_PRESS) };
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      if (press.current && Math.hypot(event.clientX - press.current.x, event.clientY - press.current.y) > SLOP) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onClickCapture(event: MouseEvent<HTMLElement>) {
      if (!fired.current) return;
      fired.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  }), [clear]);
}
