'use client';

// 自分のプロフィールを開いているかを共有し、初回設定の案内が編集画面へ重ならないようにする。
import { useEffect, useSyncExternalStore } from 'react';

let open = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export function useMarkOwnProfileOpen(active: boolean) {
  useEffect(() => {
    if (!active) return;
    open++; emit();
    return () => { open--; emit(); };
  }, [active]);
}
export const useOwnProfileOpen = () => useSyncExternalStore(subscribe, () => open > 0, () => false);
