'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { MAX_ASPECT, MIN_ASPECT, STAGE_HEIGHT, enterLandscape, fitStage, setStageTransform } from './stageSpace';
import type { StageTransform } from './stageSpace';
import styles from './GameStage.module.css';

/**
 * The landscape stage shared by every game route, including menus and loading screens.
 * It is scaled to fit the area clear of notches and turned on a portrait screen. On a touch screen,
 * a game navigation/start tap also asks for full screen in landscape (Android); where refused the turned
 * stage is what the player sees.
 */
export function GameStage({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const menu = !/^\/game\/(play|room|replay)(\/|$)/.test(pathname ?? '');
  const safe = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ width: number; transform: StageTransform } | null>(null);

  useLayoutEffect(() => {
    const element = safe.current;
    if (!element) return;
    const measure = () => {
      const next = fitStage(element.getBoundingClientRect());
      setStageTransform(next.transform);
      setFit(previous => previous && previous.width === next.width && sameTransform(previous.transform, next.transform) ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); setStageTransform(null); };
  }, []);

  useEffect(() => {
    // pointerup, not pointerdown: a touch only counts as a user gesture once it ends.
    const ask = (event: PointerEvent) => {
      // Login popups, native selects, install/share and clipboard actions need their own user gesture.
      if (menu && !(event.target instanceof Element && event.target.closest('[data-landscape-action]'))) return;
      if (window.matchMedia('(pointer: coarse)').matches) void enterLandscape();
    };
    window.addEventListener('pointerup', ask, true);
    return () => window.removeEventListener('pointerup', ask, true);
  }, [menu]);

  const transform = fit?.transform;
  const style = {
    '--stage-height': `${STAGE_HEIGHT}px`,
    '--stage-min-width': `${Math.round(STAGE_HEIGHT * MIN_ASPECT)}px`,
    '--stage-max-width': `${Math.round(STAGE_HEIGHT * MAX_ASPECT)}px`,
    width: fit?.width, height: STAGE_HEIGHT,
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)${transform.rotated ? ' rotate(-90deg)' : ''} scale(${transform.scale})` : undefined,
    visibility: fit ? 'visible' : undefined,
  } as CSSProperties;
  return <div className={`${styles.screen} ${menu ? styles.menu : ''}`}>
    <div ref={safe} className={styles.safe} aria-hidden="true" />
    <div className={styles.stage} style={style} data-game-stage data-rotated={transform?.rotated || undefined}>{children}</div>
  </div>;
}

const sameTransform = (a: StageTransform, b: StageTransform) => a.x === b.x && a.y === b.y && a.scale === b.scale && a.rotated === b.rotated;
