import type { ReactNode } from 'react';
import { GameNotifications } from '@/components/game/notifications/GameNotifications';
import { NoticeToasts } from '@/components/game/notifications/NoticeToasts';
import { LaunchpadProvider } from '@/components/game/launchpad/LaunchpadProvider';
import { PlazaProvider } from '@/components/game/plaza/PlazaProvider';
import { GameStage } from '@/components/game/stage/GameStage';
import { gameViewport } from '@/components/game/stage/gameViewport';
import { RoomChatProvider } from '@/components/game/chat/RoomChatProvider';
import { GameAudioProvider } from '@/components/game/audio/GameAudio';

export const viewport = gameViewport;

/** The room the player is in and the game's menu live here, so they outlast every page of the game. The language comes from the root layout's LocaleProvider. */
export default function GameLayout({ children }: { children: ReactNode }) {
  return <GameStage><GameAudioProvider><GameNotifications><PlazaProvider><NoticeToasts><RoomChatProvider><LaunchpadProvider>{children}</LaunchpadProvider></RoomChatProvider></NoticeToasts></PlazaProvider></GameNotifications></GameAudioProvider></GameStage>;
}
