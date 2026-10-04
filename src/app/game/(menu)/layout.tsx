import type { ReactNode } from 'react';
import GameMenu from '@/components/game/home/GameMenu';

/** Everything outside the board: the tab column on the left, the chosen tab's page on the right. */
export default function GameMenuLayout({ children }: { children: ReactNode }) {
    return <GameMenu>{children}</GameMenu>;
}
