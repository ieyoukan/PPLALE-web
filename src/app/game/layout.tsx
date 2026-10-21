import type { ReactNode } from 'react';
import { GameNotifications } from '@/components/game/notifications/GameNotifications';
import { GameStage } from '@/components/game/stage/GameStage';
import { gameViewport } from '@/components/game/stage/gameViewport';

export const viewport = gameViewport;

export default function GameLayout({ children }: { children: ReactNode }) {
  return <GameStage><GameNotifications>{children}</GameNotifications></GameStage>;
}
