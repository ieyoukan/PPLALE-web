import type { ReactNode } from 'react';
import { GameNotifications } from '@/components/game/notifications/GameNotifications';
import { LaunchpadProvider } from '@/components/game/plaza/Launchpad';
import { PlazaProvider } from '@/components/game/plaza/PlazaProvider';
import { GameStage } from '@/components/game/stage/GameStage';
import { gameViewport } from '@/components/game/stage/gameViewport';

export const viewport = gameViewport;

/** The room the player is in and the game's menu live here, so they outlast every page of the game. */
export default function GameLayout({ children }: { children: ReactNode }) {
  return <GameStage><GameNotifications><PlazaProvider><LaunchpadProvider>{children}</LaunchpadProvider></PlazaProvider></GameNotifications></GameStage>;
}
