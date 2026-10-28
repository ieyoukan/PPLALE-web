import { createContext } from 'react';
import type { RefObject } from 'react';

/** A physical surface for the common board, with a root containing both cards and screen controls.
 * Keeping that root lets dragging and animations measure cards across the portal. */
export interface BoardSurfaceMount {
  target: HTMLElement;
  root: RefObject<HTMLDivElement | null>;
  controlsReady: boolean;
}

export const BoardSurfaceContext = createContext<BoardSurfaceMount | undefined>(undefined);
