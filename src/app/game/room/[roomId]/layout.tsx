'use client';

import { usePathname } from 'next/navigation';
import { isPlazaPath } from '@/components/game/plaza/PlazaProvider';
import type { ReactNode } from 'react';

/**
 * A room, and (`window`) a page of the game opened over it: following a link from the room to the
 * friends, the cards or another page shows it in a window while the room stays on screen and
 * connected. Opening that page's address directly shows it on its own, as always.
 */
export default function RoomLayout({ children, window }: { children: ReactNode; window: ReactNode }) {
  const pathname = usePathname();
  return <><div style={{ display: 'contents' }} inert={!isPlazaPath(pathname)}>{children}</div>{window}</>;
}
