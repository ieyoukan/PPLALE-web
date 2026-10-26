'use client';

import { createContext, useContext } from 'react';
import type { Place } from './places';

export interface LaunchpadValue {
  open: () => void;
  close: () => void;
  toggle: () => void;
  shown: boolean;
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
  /** Opens the launchpad on a section (a link inside the game, or an old address on the way to the room). */
  openAt: (place: Place, across?: boolean) => void;
  /** The section shown, and the way back through the sections opened from it. */
  place: Place;
  back: (() => void) | null;
}

const nothing = () => {};
export const LaunchpadContext = createContext<LaunchpadValue>({ open: nothing, close: nothing, toggle: nothing, shown: false, expanded: false, setExpanded: nothing, openAt: nothing, place: { section: 'home' }, back: null });
export const useLaunchpad = () => useContext(LaunchpadContext);
