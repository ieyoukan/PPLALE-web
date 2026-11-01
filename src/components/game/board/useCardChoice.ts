'use client';

import { useEffect, useRef, useState } from 'react';
import type { Command, PendingView } from '@pplale/game-core';

type Plan = { key: string; revision: number; remaining: string[]; finish?: string; failure: string | number | undefined };
/** カードの仮選択は端末内だけ。確定後も、既存の回答を効果順に1件ずつ送る。 */
export function useCardChoice({ pending, revision, enabled, busy, failed, act }: {
  pending: PendingView | null; revision: number; enabled: boolean; busy: boolean; failed: string | number | undefined;
  act: (command: Command) => void;
}) {
  const selection = enabled ? pending?.selection : undefined;
  const draftKey = selection ? `${revision}:${selection.key}` : '';
  const [draft, setDraft] = useState({ key: '', ids: [] as string[] });
  const [plan, setPlan] = useState<Plan | null>(null);
  const advanced = useRef<Plan | null>(null);
  const locked = useRef(false);
  const selected = draft.key === draftKey ? draft.ids : [];
  const canConfirm = !!selection && !busy && !plan && selected.length >= selection.min && selected.length <= selection.max;

  useEffect(() => {
    if (!plan) { locked.current = false; return; }
    // 拒否・タイムアウト・別の効果へ進んだ場合は、残りのカードを勝手に回答しない。
    if (failed && failed !== plan.failure || revision < plan.revision || !selection || selection.key !== plan.key) { setPlan(null); return; }
    if (busy || revision <= plan.revision || advanced.current === plan) return;
    advanced.current = plan;
    const option = plan.remaining[0] ?? (pending?.buttons.some(button => button.id === plan.finish) ? plan.finish : undefined);
    if (!option || plan.remaining.length && !selection.candidates.includes(option)) { setPlan(null); return; }
    setPlan({ ...plan, revision, remaining: plan.remaining.slice(1) });
    act({ type: 'choose', actor: pending!.actor, option });
  }, [plan, pending, selection, revision, busy, failed, act]);

  return {
    selection, selected, submitting: !!plan, canConfirm,
    toggle(uid: string) {
      if (!selection?.candidates.includes(uid) || busy || plan || locked.current) return;
      const ids = selected.includes(uid) ? selected.filter(id => id !== uid)
        : selection.max === 1 ? [uid] : selected.length < selection.max ? [...selected, uid] : selected;
      setDraft({ key: draftKey, ids });
    },
    cancel() { setDraft({ key: '', ids: [] }); },
    confirm() {
      if (locked.current || !canConfirm || !selection || !pending) return;
      const option = selected[0] ?? selection.finish;
      if (!option) return;
      locked.current = true;
      setPlan({ key: selection.key, revision, remaining: selected.slice(1), finish: selection.finish, failure: failed });
      setDraft({ key: '', ids: [] });
      act({ type: 'choose', actor: pending.actor, option });
    },
  };
}
