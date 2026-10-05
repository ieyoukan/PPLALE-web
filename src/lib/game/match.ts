import { newGame, validateDeck } from '@pplale/game-core';
import type { Deck, GameState, Side } from '@pplale/game-core';
import { gameCatalog } from './catalog';
import { sideLabel } from './sessionStore';
import type { MatchSetup, Mode } from './sessionStore';

export function randomSeed(): number {
  const seed = new Uint32Array(1);
  crypto.getRandomValues(seed);
  return seed[0];
}

/** A new match from `setup`, shuffled by `seed`. Throws when a deck is not usable. */
export function createMatch(setup: MatchSetup, mode: Mode, seed: number): GameState {
  const named = (side: Side): Deck => ({ ...setup.decks[side], name: `${sideLabel(mode, side)} · ${setup.decks[side].name}` });
  return newGame([named(0), named(1)], gameCatalog, setup.rules, seed);
}

/** A saved setup that can still start a match (the decks are valid with today's cards). */
export function usableSetup(value: unknown): MatchSetup | null {
  const setup = value as Partial<MatchSetup> | null | undefined;
  if (!setup || !Array.isArray(setup.decks) || setup.decks.length !== 2 || !setup.rules || typeof setup.rules !== 'object') return null;
  try {
    return setup.decks.every(deck => validateDeck(deck, gameCatalog).length === 0) ? setup as MatchSetup : null;
  } catch { return null; }
}
