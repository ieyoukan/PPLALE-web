import type { ReactNode } from 'react';
import { preconnect } from 'react-dom';
import GameMenu from '@/components/game/home/GameMenu';

/** Everything outside the board: the tab column on the left, the chosen tab's page on the right. */
export default function GameMenuLayout({ children }: { children: ReactNode }) {
    // Profiles, decks and friends are read from Firestore as soon as the page hydrates.
    preconnect('https://firestore.googleapis.com', { crossOrigin: 'anonymous' });
    return <GameMenu>{children}</GameMenu>;
}
