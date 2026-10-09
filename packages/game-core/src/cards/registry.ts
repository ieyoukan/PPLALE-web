// Card id → script. To add a card set, write a file like strawberryYojo.ts and spread it here.
import { strawberrySweets } from './strawberrySweets.ts';
import { strawberryYojo } from './strawberryYojo.ts';
import { tokens } from './tokens.ts';
import { grapeYojo } from './grapeYojo.ts';
import { orangeYojo } from './orangeYojo.ts';
import { fruitSweets } from './fruitSweets.ts';
import type { CardScript, CardScripts } from './types.ts';
import type { GameState } from '../model.ts';

const scripts: CardScripts = { ...strawberryYojo, ...strawberrySweets, ...grapeYojo, ...orangeYojo, ...fruitSweets, ...tokens };
const none: CardScript = {};

/** The script for a card. Cards without effects get an empty script. */
export const scriptOf = (cardId: string): CardScript => scripts[cardId] ?? none;
export const allScripts = (): CardScript[] => Object.values(scripts);
export const scriptFor = (s: GameState, uid: string): CardScript => s.cards[uid]?.silenced ? none : scriptOf(s.cards[uid]?.cardId);
export const implementedCard = (cardId: string) => Object.hasOwn(scripts, cardId);
/** Fruits whose cards are all implemented: decks (and the rules of a match) may use them. Add a fruit when its set is done. */
export const implementedFruits: readonly string[] = ['strawberry', 'grape', 'orange'];
