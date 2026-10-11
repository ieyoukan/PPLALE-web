// Where the deck of a match comes from. The preparation of a CPU match and a room's lobby both ask
// here which decks fit the rules of the match (and why the others do not), so a new source added to
// `deckSources` shows up in both. Planned: 'draft' (2pick) — decks drafted in this browser for the rules.
import { deckRuleErrors, randomDeck } from '@pplale/game-core';
import type { Deck, MatchRules } from '@pplale/game-core';
import { demoDeck, gameCatalog } from './catalog';
import type { SavedGameDeck } from './savedDecks';

export type DeckSourceId = 'trial' | 'random' | 'saved';

/** One deck a selector offers. */
export interface DeckChoice {
  /** Unique among all sources: the selector's value. */
  id: string;
  source: DeckSourceId;
  name: string;
  /** Shown beside the name: the size of the deck, or how it is made. */
  note: string;
  /** Why the rules do not allow it (empty when they do). */
  errors: string[];
  /** The deck to play with. A source that makes its deck on demand makes it from the seed: another seed, another deck. */
  deck: (seed: number) => Deck;
}

export interface SourceContext {
  /** The signed-in player's decks (savedDecks.ts); empty without a login. */
  saved: SavedGameDeck[];
  /** Names the rules in the reasons: このルール, このルーム … */
  where?: string;
}
export interface DeckSource {
  id: DeckSourceId;
  /** What the source has for a match with these rules, usable or not. */
  choices: (rules: MatchRules, context: SourceContext) => DeckChoice[];
}

const size = (deck: Deck) => `${deck.yojo.length} / ${deck.sweet.length}`;
const ready = (source: DeckSourceId, id: string, deck: Deck, rules: MatchRules, where?: string): DeckChoice =>
  ({ id: `${source}:${id}`, source, name: deck.name, note: size(deck), errors: deckRuleErrors(deck, rules, gameCatalog, where), deck: () => deck });

/** In the order the selectors list them; the first usable one is chosen until the player picks another. */
export const deckSources: DeckSource[] = [
  // Ready-made decks that need no login.
  { id: 'trial', choices: (rules, { where }) => [ready('trial', 'strawberry', demoDeck, rules, where)] },
  // おまかせ: made anew for every match from the cards the rules allow.
  {
    id: 'random',
    choices: rules => [{
      id: 'random:deck', source: 'random', name: 'おまかせデッキ', note: 'ルールに合うカードからランダム',
      errors: randomDeck(rules, gameCatalog, 0) ? [] : ['このルールで使えるカードだけでは、デッキを作れません'],
      deck: seed => {
        const deck = randomDeck(rules, gameCatalog, seed);
        if (!deck) throw new Error('このルールで使えるカードだけでは、デッキを作れません');
        return deck;
      },
    }],
  },
  // Decks built on the site and kept in the player's account.
  { id: 'saved', choices: (rules, { saved, where }) => saved.map(({ id, deck }) => ready('saved', id, deck, rules, where)) },
];

/** Every deck the sources have for these rules. */
export const deckChoices = (rules: MatchRules, context: SourceContext): DeckChoice[] => deckSources.flatMap(source => source.choices(rules, context));

/** The choice to play with: the selected one while the rules allow it, else the first they allow (none: undefined). */
export const usableChoice = (choices: DeckChoice[], selected: string): DeckChoice | undefined =>
  choices.find(choice => choice.id === selected && !choice.errors.length) ?? choices.find(choice => !choice.errors.length);
