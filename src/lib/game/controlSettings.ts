'use client';

// 対戦のカードの操作方法（この端末に保存）。drag：カードを持って動かす。aim：カードは置いたまま、曲線の矢印でねらって離す。
import { useSyncExternalStore } from 'react';

export type CardControl = 'drag' | 'aim';
const KEY = 'pplale-card-control-v1';
const CHANGED = 'pplale-card-control-changed';

export function readCardControl(): CardControl {
  try { return localStorage.getItem(KEY) === 'aim' ? 'aim' : 'drag'; } catch { return 'drag'; }
}
export function saveCardControl(control: CardControl) {
  try { localStorage.setItem(KEY, control); } catch { /* This visit only. */ }
  window.dispatchEvent(new Event(CHANGED));
}
const subscribe = (listener: () => void) => {
  window.addEventListener(CHANGED, listener); window.addEventListener('storage', listener);
  return () => { window.removeEventListener(CHANGED, listener); window.removeEventListener('storage', listener); };
};
export const useCardControl = () => useSyncExternalStore(subscribe, readCardControl, () => 'drag' as CardControl);
