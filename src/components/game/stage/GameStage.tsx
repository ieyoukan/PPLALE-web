'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { STAGE_HEIGHT, enterLandscape, fitStage, setStageTransform } from './stageSpace';
import type { StageTransform } from './stageSpace';
import styles from './GameStage.module.css';

/**
 * The fixed-size stage every match screen is laid out on (see stageSpace). It is scaled to fit the
 * part of the screen clear of notches, and turned on a portrait screen. On a touch screen held upright,
 * the first tap also asks for full screen in landscape (Android); where that is refused the turned
 * stage is what the player sees.
 */
export function GameStage({ children }: { children: ReactNode }) {
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
    const upright = () => window.matchMedia('(pointer: coarse)').matches && window.innerHeight > window.innerWidth;
    // pointerup, not pointerdown: a touch only counts as a user gesture once it ends.
    const ask = () => { if (upright()) void enterLandscape(); };
    window.addEventListener('pointerup', ask, true);
    return () => window.removeEventListener('pointerup', ask, true);
  }, []);

  const transform = fit?.transform;
  const style = {
    width: fit?.width ?? Math.round(STAGE_HEIGHT * 16 / 9), height: STAGE_HEIGHT,
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)${transform.rotated ? ' rotate(-90deg)' : ''} scale(${transform.scale})` : undefined,
    visibility: fit ? undefined : 'hidden',
  } as CSSProperties;
  return <div className={styles.screen}>
    <div ref={safe} className={styles.safe} aria-hidden="true" />
    <div className={styles.stage} style={style} data-game-stage data-rotated={transform?.rotated || undefined}>{children}</div>
  </div>;
}

const sameTransform = (a: StageTransform, b: StageTransform) => a.x === b.x && a.y === b.y && a.scale === b.scale && a.rotated === b.rotated;
