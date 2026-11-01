'use client';

// CPU戦とルームで共用するデッキ選択。候補と使用できない理由はlib/game/deckSources.tsから取得する。
import { useEffect, useMemo, useState } from 'react';
import type { MatchRules } from '@pplale/game-core';
import { useAuth } from '@/lib/auth';
import { deckChoices, deckNameIn } from '@/lib/game/deckSources';
import { useI18n } from '@/i18n/LocaleProvider';
import type { DeckChoice } from '@/lib/game/deckSources';
import type { SavedGameDeck } from '@/lib/game/savedDecks';
import { validateDeck } from '@pplale/game-core';
import { gameCatalog } from '@/lib/game/catalog';
import { DECKS_CHANGED } from '@/lib/game/deckStore';

/**
 * The player's saved decks: their account's when signed in, this browser's (the game's and the site's guest
 * decks) otherwise. Read again whenever a deck is saved or deleted (deckStore `DECKS_CHANGED`).
 */
function useSavedDecks() {
  const { user, loading: authLoading } = useAuth();
  const uid = user?.uid ?? null;
  const [decks, setDecks] = useState<SavedGameDeck[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (authLoading) return;
    let active = true;
    setDecks([]);
    setError('');
    const load = (first: boolean) => {
      if (first) setLoading(true);
      import('@/lib/game/deckStore').then(({ listDecks }) => listDecks(uid))
        .then(result => { if (active) setDecks(result.map(saved => {
          const deck = { name: saved.name || '無名のデッキ', yojo: saved.yojo, sweet: saved.sweet, playable: saved.playable ?? '' };
          return { id: saved.id, deck, errors: validateDeck(deck, gameCatalog) };
        })); })
        .catch(() => { if (active) setError('保存済みデッキを読み込めませんでした。接続とログイン状態を確認してください。'); })
        .finally(() => { if (active) setLoading(false); });
    };
    load(true);
    const changed = () => load(false);
    window.addEventListener(DECKS_CHANGED, changed);
    return () => { active = false; window.removeEventListener(DECKS_CHANGED, changed); };
  }, [uid, authLoading]);
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
  const { t } = useI18n();
  return <select value={chosen?.id ?? ''} onChange={event => onChange(event.target.value)}>
    {!chosen && <option value="" disabled>{t('このルールで使えるデッキがありません')}</option>}
    {choices.map(choice => <option key={choice.id} value={choice.id} disabled={!!choice.errors.length}>
      {t('{name}（{note}）', { name: deckNameIn(choice.name, t), note: t(choice.errors.length ? 'このルールでは使えません' : choice.note) })}
    </option>)}
  </select>;
}

/** Why the decks that cannot be chosen do not fit (nothing when all of them do). */
export function UnusableDecks({ choices, className }: { choices: DeckChoice[]; className?: string }) {
  const { t, gameText } = useI18n();
  const unusable = choices.filter(choice => choice.errors.length);
  if (!unusable.length) return null;
  return <details className={className}>
    <summary>{t('使えないデッキの理由')}</summary>
    {unusable.map(choice => <p key={choice.id}>{t('{name}：{text}', { name: deckNameIn(choice.name, t), text: choice.errors.map(gameText).join(' / ') })}</p>)}
  </details>;
}
