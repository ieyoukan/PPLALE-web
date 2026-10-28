'use client';

import { useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { Side } from '@pplale/game-core';

interface Pose { key: string; active: boolean; width: number; height: number; transform: string }

/** Resize the model once, then animate only its camera transform (FLIP), keeping the scene mounted.
 * Layout coordinates are in GameStage units, so portrait rotation and screen scaling need no special case. */
export function useRoomCamera({ root, active, viewer, animate, onReady }: {
  root: RefObject<HTMLDivElement | null>; active: boolean; viewer: Side; animate: boolean; onReady: (ready: boolean) => void;
}) {
  const scene = useRef<HTMLDivElement>(null), world = useRef<HTMLDivElement>(null), projection = useRef<HTMLDivElement>(null);
  const previous = useRef<Pose | null>(null), flight = useRef<Animation[] | null>(null);
  const interrupted = useRef<string | null>(null);
  useLayoutEffect(() => {
    // Child layout effects can run before the parent's ref is attached on the first commit.
    const frame = scene.current, model = world.current, room = root.current ?? frame?.parentElement, surface = projection.current;
    if (!frame || !model || !room || !surface) return;
    const models = [model, surface];
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const measure = () => {
      const key = [active, viewer, room.clientWidth, room.clientHeight, frame.offsetLeft, frame.offsetTop, frame.clientWidth, frame.clientHeight, reduced.matches].join(':');
      const old = previous.current;
      if (old?.key === key) {
        // A restarted layout effect must not leave controls waiting on an animation it cancelled.
        if (!flight.current && frame.dataset.roomCamera === 'moving') {
          interrupted.current = null; frame.dataset.roomCamera = active ? 'match' : 'lobby'; onReady(true);
        }
        return;
      }
      const rail = Math.min(224, Math.max(176, room.clientWidth * .14));
      const width = active ? Math.max(760, room.clientWidth - rail - 24) : Math.min(frame.clientHeight * 1.38, frame.clientWidth * 1.04);
      const height = active ? room.clientHeight : width * 9 / 16;
      const x = active ? width / 2 - frame.offsetLeft - frame.clientWidth / 2 : 0;
      const y = active ? height / 2 - frame.offsetTop - frame.clientHeight / 2 : -56;
      const turn = active ? viewer === 1 ? 180 : 0 : 90;
      const transform = `translate3d(${x}px, ${y}px, 0) rotateX(${active ? 0 : 58}deg) rotateZ(${turn}deg)`;
      const from = flight.current ? getComputedStyle(model).transform : interrupted.current ?? old?.transform;
      interrupted.current = null;
      flight.current?.forEach(animation => animation.cancel()); flight.current = null;
      for (const element of models) { element.style.width = `${width}px`; element.style.height = `${height}px`; element.style.transform = transform; }
      previous.current = { key, active, width, height, transform };
      const moving = !!old && old.active !== active && animate && !reduced.matches;
      frame.dataset.roomCamera = moving ? 'moving' : active ? 'match' : 'lobby';
      onReady(!moving);
      if (!moving || !from) return;
      const animations = models.map(element => element.animate([
        { transform: `${from} scale3d(${old.width / width}, ${old.height / height}, 1)` },
        { transform },
      ], { duration: 1100, easing: 'cubic-bezier(.4, 0, .15, 1)' }));
      const start = document.timeline.currentTime;
      if (typeof start === 'number') animations.forEach(animation => { animation.startTime = start; });
      flight.current = animations;
      const settle = () => {
        if (flight.current !== animations) return;
        flight.current = null; animations.forEach(animation => animation.cancel()); frame.dataset.roomCamera = active ? 'match' : 'lobby'; onReady(true);
      };
      animations.forEach(animation => { void animation.finished.then(settle, settle); });
    };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(frame); observer.observe(room);
    reduced.addEventListener('change', measure);
    return () => {
      observer.disconnect(); reduced.removeEventListener('change', measure);
      if (flight.current) {
        interrupted.current = getComputedStyle(model).transform;
        flight.current.forEach(animation => animation.cancel()); flight.current = null;
      }
    };
  }, [root, active, viewer, animate, onReady]);
  return { scene, world, projection };
}
