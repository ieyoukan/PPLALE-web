import type { ReactNode } from 'react';
import { GameNotifications } from '@/components/game/notifications/GameNotifications';
import { LaunchpadProvider } from '@/components/game/launchpad/LaunchpadProvider';
import { PlazaProvider } from '@/components/game/plaza/PlazaProvider';
import { GameStage } from '@/components/game/stage/GameStage';
import { gameViewport } from '@/components/game/stage/gameViewport';
import { RoomChatProvider } from '@/components/game/chat/RoomChatProvider';

export const viewport = gameViewport;

/** The room the player is in and the game's menu live here, so they outlast every page of the game. */
export default function GameLayout({ children }: { children: ReactNode }) {
  return <GameStage><GameNotifications><PlazaProvider><RoomChatProvider><LaunchpadProvider>{children}</LaunchpadProvider></RoomChatProvider></PlazaProvider></GameNotifications></GameStage>;
}
