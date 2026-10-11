import { deckRuleErrors, newGame, parseMatchRules, validateDeck } from '@pplale/game-core';
import type { Deck, GameState, MatchRules, Side } from '@pplale/game-core';
import { gameCatalog } from './catalog';
import { sideLabel } from './sessionStore';
import type { MatchSetup, Mode } from './sessionStore';

export function randomSeed(): number {
  const seed = new Uint32Array(1);
  crypto.getRandomValues(seed);
  return seed[0];
}

/** Why the deck cannot be played in a match with these rules; without rules (an old save) it only has to be a valid deck. */
const deckErrors = (deck: Deck, rules: MatchRules | undefined) => rules ? deckRuleErrors(deck, rules, gameCatalog, 'この対戦') : validateDeck(deck, gameCatalog);

/** A new match from `setup`, shuffled by `seed`. Throws when a deck is not usable (under the setup's rules, when it has them). */
export function createMatch(setup: MatchSetup, mode: Mode, seed: number): GameState {
  const errors = Array.from(new Set(setup.decks.flatMap(deck => deckErrors(deck, setup.matchRules))));
  if (errors.length) throw new Error(errors.join(' / '));
  const named = (side: Side): Deck => ({ ...setup.decks[side], name: `${sideLabel(mode, side)} · ${setup.decks[side].name}` });
  return newGame([named(0), named(1)], gameCatalog, setup.rules, seed);
}

/** A saved setup that can still start a match (the decks are valid with today's cards and fit its rules). */
export function usableSetup(value: unknown): MatchSetup | null {
  const setup = value as Partial<MatchSetup> | null | undefined;
  if (!setup || !Array.isArray(setup.decks) || setup.decks.length !== 2 || !setup.rules || typeof setup.rules !== 'object') return null;
  // Rules that no longer parse (nothing of them can be played today) cannot start a match either.
  const matchRules = setup.matchRules === undefined ? undefined : parseMatchRules(setup.matchRules);
  if (matchRules === null) return null;
  try {
    if (!setup.decks.every(deck => deckErrors(deck, matchRules).length === 0)) return null;
    return { decks: setup.decks as [Deck, Deck], rules: setup.rules, ...(matchRules && { matchRules }) };
  } catch { return null; }
}
