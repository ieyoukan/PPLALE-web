import type { Viewport } from 'next';

/** Every game screen: GameStage keeps menus and boards clear of notches and scales them to fit. */
export const gameViewport: Viewport = {
  width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: 'cover',
};
