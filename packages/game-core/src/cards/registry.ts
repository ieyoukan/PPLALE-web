// Card id → script. To add a card set, write a file like strawberryYojo.ts and spread it here.
import { strawberrySweets } from './strawberrySweets.ts';
import { strawberryYojo } from './strawberryYojo.ts';
import { tokens } from './tokens.ts';
import type { CardScript, CardScripts } from './types.ts';

const scripts: CardScripts = { ...strawberryYojo, ...strawberrySweets, ...tokens };
const none: CardScript = {};

/** The script for a card. Cards without effects get an empty script. */
export const scriptOf = (cardId: string): CardScript => scripts[cardId] ?? none;
export const allScripts = (): CardScript[] => Object.values(scripts);
