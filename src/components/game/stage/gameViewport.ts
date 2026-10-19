import type { Viewport } from 'next';

/** The match screens: drawn under notches (GameStage keeps the table clear of them) and never zoomed. */
export const gameViewport: Viewport = {
  width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: 'cover',
};
