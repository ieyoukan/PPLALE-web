// The rules of a match: which cards its decks may use. A room is made with them (room.ts), and a
// match against the CPU is prepared with them; a deck source (saved decks, the trial decks, a random
// deck, later a 2pick draft) only offers decks that fit.
import type { Catalog, Deck } from './model.ts';
import { implementedFruits } from './cards/registry.ts';
import { extendedPlayables, playableSkills } from './playables/skills.ts';
import { validateDeck } from './setup.ts';

export const fruits = ['strawberry', 'grape', 'melon', 'orange'] as const;
export type Fruit = typeof fruits[number];
export const fruitNames: Record<Fruit, string> = { strawberry: 'いちご', grape: 'ぶどう', melon: 'めろん', orange: 'おれんじ' };

export interface MatchRules {
    /** Fruits whose 幼女 and お菓子 may be in a deck. */
    fruits: Fruit[];
    /** Whether 拡張プレイアブル (version β) may lead a deck. */
    extendedPlayable: boolean;
}
export const defaultMatchRules: MatchRules = { fruits: ['strawberry'], extendedPlayable: false };
/** What the engine can play today. Rules cannot allow more than this; it grows as cards are implemented. */
export const playableNow: MatchRules = {
    fruits: fruits.filter(fruit => implementedFruits.includes(fruit)),
    extendedPlayable: extendedPlayables.some(id => id in playableSkills),
};

/** The usable part of anything sent as rules, or null when no fruit is left. */
export function parseMatchRules(value: unknown): MatchRules | null {
    const raw = value as Partial<MatchRules> | null | undefined;
    const chosen = Array.isArray(raw?.fruits) ? fruits.filter(fruit => raw.fruits!.includes(fruit) && playableNow.fruits.includes(fruit)) : [];
    return chosen.length ? { fruits: chosen, extendedPlayable: raw?.extendedPlayable === true && playableNow.extendedPlayable } : null;
}

export const isExtendedPlayable = (catalog: Catalog, id: string) => catalog[id]?.type === 'playable' && (catalog[id].version ?? 'normal') !== 'normal';

/** Why the deck cannot be used under these rules (empty when it can). `where` names them: このルーム, この対戦 … */
export function deckRuleErrors(deck: Deck, rules: MatchRules, catalog: Catalog, where = 'このルール'): string[] {
    const errors: string[] = [];
    const used = new Set([...deck.yojo, ...deck.sweet].map(id => catalog[id]?.fruit).filter((fruit): fruit is Fruit => fruits.includes(fruit as Fruit)));
    for (const fruit of Array.from(used)) if (!rules.fruits.includes(fruit)) errors.push(`${where}では${fruitNames[fruit]}のカードを使えません`);
    if (isExtendedPlayable(catalog, deck.playable) && !rules.extendedPlayable) errors.push(`${where}では拡張プレイアブルを使えません`);
    if (rules.fruits.includes('orange') && deck.sweet.includes('s_24')) errors.push('ぷぷりえーるはオレンジ環境以降では使用できません');
    return errors.length ? errors : validateDeck(deck, catalog);
}

/** One line for the lobby and for sharing, e.g. 「フルーツ：いちご ／ 拡張プレイアブル：なし」. */
export const describeMatchRules = (rules: MatchRules) =>
    `フルーツ：${rules.fruits.map(fruit => fruitNames[fruit]).join('・')} ／ 拡張プレイアブル：${rules.extendedPlayable ? 'あり' : 'なし'}`;
