import type { ReactNode } from 'react';
import { GameNotifications } from '@/components/game/notifications/GameNotifications';

export default function GameLayout({ children }: { children: ReactNode }) {
  return <GameNotifications>{children}</GameNotifications>;
}
