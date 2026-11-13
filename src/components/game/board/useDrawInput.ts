'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** 移動演出とは別に、二重タップだけを短く抑える。入力の予約・自動ドローはしない。 */
export function useDrawInput() {
  const [waiting, setWaiting] = useState(false);
  const locked = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    locked.current = false;
    setWaiting(false);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const take = useCallback(() => {
    if (locked.current) return false;
    locked.current = true;
    setWaiting(true);
    timer.current = setTimeout(reset, 300);
    return true;
  }, [reset]);
  return { waiting, take, reset };
}
