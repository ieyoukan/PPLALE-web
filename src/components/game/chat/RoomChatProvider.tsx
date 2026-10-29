'use client';

// 入室後だけチャットを表示する。画面の切り替え中も、現在のルームの開閉状態を共有する。
import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { isPlazaPath, plazaHref, usePlaza } from '../plaza/PlazaProvider';
import { RoomChatPanel } from './RoomChatPanel';

const Context = createContext(false);
export const useRoomChatOpen = () => useContext(Context);

export function RoomChatProvider({ children }: { children: ReactNode }) {
  const { id, view, stage } = usePlaza();
  const pathname = usePathname();
  const [openedRoomId, setOpenedRoomId] = useState<string | null>(null);
  const isLaunchPage = pathname === '/game' || pathname === '/game/';
  const isChangingRoomPage = isPlazaPath(pathname) && pathname !== plazaHref(id ?? '');
  const isMember = view?.plaza?.members.some(member => member.id === view.plaza?.me);
  const available = !isLaunchPage && !isChangingRoomPage && stage.kind === 'in'
    && !!id && view?.id === id && view.status !== 'closed' && !!isMember;
  const open = available && openedRoomId === id;
  return <Context.Provider value={open}>
    {children}
    {available && <RoomChatPanel key={id} open={open} onOpen={() => setOpenedRoomId(id)} onClose={() => setOpenedRoomId(null)} />}
  </Context.Provider>;
}

