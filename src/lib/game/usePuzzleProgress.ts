'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { PUZZLE_PROGRESS_EVENT, PUZZLE_PROGRESS_KEY, parsePuzzleProgress, puzzleProgressSnapshot } from './puzzleProgress';

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === null || event.key === PUZZLE_PROGRESS_KEY) onChange(); };
  window.addEventListener(PUZZLE_PROGRESS_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(PUZZLE_PROGRESS_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/** 同じタブでのクリアと別タブでの更新を、ミッション・一覧・ルームに反映する。 */
export function usePuzzleProgress() {
  const snapshot = useSyncExternalStore<string | null>(subscribe, puzzleProgressSnapshot, () => null);
  const cleared = useMemo(() => parsePuzzleProgress(snapshot), [snapshot]);
  return { cleared, ready: snapshot !== null };
}
