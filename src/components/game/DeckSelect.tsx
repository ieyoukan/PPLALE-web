'use client';

// CPU戦とルームで共用するデッキ選択。候補と使用できない理由はlib/game/deckSources.tsから取得する。
import { useEffect, useMemo, useState } from 'react';
import type { MatchRules } from '@pplale/game-core';
import { useAuth } from '@/lib/auth';
import { deckChoices } from '@/lib/game/deckSources';
import type { DeckChoice } from '@/lib/game/deckSources';
import type { SavedGameDeck } from '@/lib/game/savedDecks';

/** The signed-in player's saved decks (none without a login). */
function useSavedDecks() {
  const { user } = useAuth();
  const [decks, setDecks] = useState<SavedGameDeck[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setDecks([]);
    setError('');
    if (!user) return setLoading(false);
    setLoading(true);
    import('@/lib/game/savedDecks').then(({ loadGameDecks }) => loadGameDecks(user.uid))
      .then(result => { if (active) setDecks(result); })
      .catch(() => { if (active) setError('保存済みデッキを読み込めませんでした。接続とログイン状態を確認してください。'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user]);
  return { decks, loading, error };
}

/** Every deck there is for a match with these rules (`where` names them in the reasons), and how the saved ones are doing. */
export function useDeckChoices(rules: MatchRules, where?: string) {
  const saved = useSavedDecks();
  // Socket views contain fresh objects even when the deck rules have not changed.
  const key = JSON.stringify({ fruits: rules.fruits, extendedPlayable: rules.extendedPlayable });
  const choices = useMemo(() => deckChoices(JSON.parse(key) as MatchRules, { saved: saved.decks, where }), [key, saved.decks, where]);
  return { choices, saved };
}

/** `chosen` is what `usableChoice` gave; without one, no deck fits the rules. */
export function DeckSelect({ choices, chosen, onChange }: { choices: DeckChoice[]; chosen: DeckChoice | undefined; onChange: (id: string) => void }) {
  return <select value={chosen?.id ?? ''} onChange={event => onChange(event.target.value)}>
    {!chosen && <option value="" disabled>このルールで使えるデッキがありません</option>}
    {choices.map(choice => <option key={choice.id} value={choice.id} disabled={!!choice.errors.length}>
      {choice.name}（{choice.errors.length ? 'このルールでは使えません' : choice.note}）
    </option>)}
  </select>;
}

/** Why the decks that cannot be chosen do not fit (nothing when all of them do). */
export function UnusableDecks({ choices, className }: { choices: DeckChoice[]; className?: string }) {
  const unusable = choices.filter(choice => choice.errors.length);
  if (!unusable.length) return null;
  return <details className={className}>
    <summary>使えないデッキの理由</summary>
    {unusable.map(choice => <p key={choice.id}>{choice.name}：{choice.errors.join(' / ')}</p>)}
  </details>;
}
