// デッキに使用できるカードのルール。ルーム・CPU戦・保存済みデッキ・おためしデッキで同じ判定を使う。
import { OPENING_HAND_RANGE, sandboxRules } from './model.ts';
import type { Catalog, Deck, Rules, Side } from './model.ts';
import { implementedFruits } from './cards/registry.ts';
import { random, shuffled } from './core/rng.ts';
import { extendedPlayables, playableSkills } from './playables/skills.ts';
import { deckCard, singleCopy, validateDeck } from './setup.ts';

/**
 * The fruits in the order the game adds them. A match uses one of four environments: いちご, then
 * ぶどう added, then メロン, then オレンジ (`fruitsUpTo`). Other sets are not offered.
 */
export const fruits = ['strawberry', 'grape', 'melon', 'orange'] as const;
export type Fruit = typeof fruits[number];
export const fruitNames: Record<Fruit, string> = { strawberry: 'いちご', grape: 'ぶどう', melon: 'めろん', orange: 'おれんじ' };

export interface MatchRules {
    /** Fruits whose 幼女 and お菓子 may be in a deck. */
    fruits: Fruit[];
    /** Whether 拡張プレイアブル (ExP; version `beta` in the card data) may lead a deck. */
    extendedPlayable: boolean;
    /**
     * ダブルプレイアブル: a deck may bring a second playable (`Deck.subPlayable`) and switch between the two.
     * Left out: no (a deck that has one plays with its first playable alone).
     */
    doublePlayable?: boolean;
}
export const defaultMatchRules: MatchRules = { fruits: ['strawberry'], extendedPlayable: false };
/** What the engine can play today. Rules cannot allow more than this; it grows as cards are implemented. */
export const playableNow: MatchRules = {
    fruits: fruits.filter(fruit => implementedFruits.includes(fruit)),
    extendedPlayable: extendedPlayables.some(id => id in playableSkills),
};

/** The environment that ends with `fruit`: いちご and every fruit added up to it. */
export const fruitsUpTo = (fruit: Fruit): Fruit[] => fruits.slice(0, fruits.indexOf(fruit) + 1);

/**
 * The usable part of anything sent as rules, or null when no fruit is left. The fruits become the
 * environment of the newest fruit chosen (`fruitsUpTo`), within what the engine can play.
 */
export function parseMatchRules(value: unknown): MatchRules | null {
    const raw = value as Partial<MatchRules> | null | undefined;
    const chosen = Array.isArray(raw?.fruits) ? fruits.filter(fruit => raw.fruits!.includes(fruit) && playableNow.fruits.includes(fruit)) : [];
    const newest = chosen.at(-1);
    return newest ? {
        fruits: fruitsUpTo(newest).filter(fruit => playableNow.fruits.includes(fruit)), extendedPlayable: raw?.extendedPlayable === true && playableNow.extendedPlayable,
        ...(raw?.doublePlayable === true && { doublePlayable: true }),
    } : null;
}

export const isExtendedPlayable = (catalog: Catalog, id: string) => catalog[id]?.type === 'playable' && (catalog[id].version ?? 'normal') !== 'normal';
/** ぷぷりえーる (s_24) left the game with the orange set: no deck has it where orange is allowed. */
const retired = (id: string, rules: MatchRules) => id === 's_24' && rules.fruits.includes('orange');

/** Why the deck cannot be used under these rules (empty when it can). `where` names them: このルーム, この対戦 … */
export function deckRuleErrors(deck: Deck, rules: MatchRules, catalog: Catalog, where = 'このルール'): string[] {
    const errors: string[] = [];
    const used = new Set([...deck.yojo, ...deck.sweet].map(id => catalog[id]?.fruit).filter((fruit): fruit is Fruit => fruits.includes(fruit as Fruit)));
    for (const fruit of Array.from(used)) if (!rules.fruits.includes(fruit)) errors.push(`${where}では${fruitNames[fruit]}のカードを使えません`);
    // The second playable counts only where the rules allow two (elsewhere it stays out of the match).
    const playables = rules.doublePlayable && deck.subPlayable ? [deck.playable, deck.subPlayable] : [deck.playable];
    if (playables.some(id => isExtendedPlayable(catalog, id)) && !rules.extendedPlayable) errors.push(`${where}では拡張プレイアブルを使えません`);
    if (deck.sweet.some(id => retired(id, rules))) errors.push('ぷぷりえーるはオレンジ環境以降では使用できません');
    return errors.length ? errors : validateDeck(rules.doublePlayable ? deck : withoutSubPlayable(deck), catalog);
}
/** The deck as it plays where the rules allow one playable only. */
export function withoutSubPlayable(deck: Deck): Deck {
    const single = { ...deck };
    delete single.subPlayable;
    return single;
}

const cardNumber = (id: string) => Number(id.slice(2));
/**
 * A deck made at random from what the rules allow (おまかせデッキ): 20 幼女 and 10 お菓子 of the allowed
 * fruits and a playable the rules allow, so it always passes `deckRuleErrors`. The same seed gives
 * the same deck. Null when the allowed cards cannot fill a deck (a fruit without お菓子 on its own).
 */
export function randomDeck(rules: MatchRules, catalog: Catalog, seed: number): Deck | null {
    const rng = { rng: seed >>> 0 };
    const cards = (kind: 'yojo' | 'sweet', count: number): string[] | null => {
        const ids = Object.keys(catalog).filter(id => deckCard(catalog, id, kind) && rules.fruits.includes(catalog[id].fruit as Fruit) && !retired(id, rules));
        // Up to two of a card, as decks are usually built; more only where the allowed cards are too few.
        const repeatable = ids.filter(id => !singleCopy(catalog, id));
        const pool = [...ids, ...repeatable];
        while (pool.length < count && repeatable.length) pool.push(...repeatable);
        return pool.length < count ? null : shuffled(rng, pool).slice(0, count).sort((a, b) => cardNumber(a) - cardNumber(b));
    };
    const playables = Object.keys(playableSkills).filter(id => catalog[id]?.type === 'playable' && (rules.extendedPlayable || !isExtendedPlayable(catalog, id)));
    const yojo = cards('yojo', 20), sweet = cards('sweet', 10);
    if (!yojo || !sweet || !playables.length) return null;
    return { name: 'おまかせデッキ', yojo, sweet, playable: playables[random(rng, playables.length)] };
}

/** One line for the lobby and for sharing, e.g. 「フルーツ：いちご ／ 拡張プレイアブル：なし」. */
export const describeMatchRules = (rules: MatchRules) =>
    `フルーツ：${rules.fruits.map(fruit => fruitNames[fruit]).join('・')} ／ 拡張プレイアブル（ExP）：${rules.extendedPlayable ? 'あり' : 'なし'}${rules.doublePlayable ? ' ／ ダブルプレイアブル：あり' : ''}`;

/**
 * How a match is played (rooms only; every field left out is the official rule). These change the
 * engine's `Rules` (`engineRules`), not which decks may be used.
 */
export interface PlayRules {
    /** The seat that goes first, with no dice. Left out: the dice decide (official). */
    firstSeat?: Side;
    /** Opening hand sizes [先攻, 後攻]. Left out: 3 and 4 (official). */
    openingHand?: [number, number];
    /** false: the 後攻 gets no extra 2PP on its 5th turn. Left out: it does (official). */
    secondBoost?: false;
}
/** The official opening hands [先攻, 後攻]. */
export const OFFICIAL_OPENING_HAND: readonly [number, number] = [3, 4];
const handSize = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= OPENING_HAND_RANGE.min && (value as number) <= OPENING_HAND_RANGE.max;

/** The usable part of anything sent as play rules; what equals the official rule is left out. */
export function parsePlayRules(value: unknown): PlayRules {
    const raw = value as Partial<PlayRules> | null | undefined;
    const hand = raw?.openingHand;
    const opening = Array.isArray(hand) && hand.length === 2 && hand.every(handSize) && (hand[0] !== OFFICIAL_OPENING_HAND[0] || hand[1] !== OFFICIAL_OPENING_HAND[1]) ? [hand[0], hand[1]] as [number, number] : undefined;
    return {
        ...((raw?.firstSeat === 0 || raw?.firstSeat === 1) && { firstSeat: raw.firstSeat }),
        ...(opening && { openingHand: opening }),
        ...(raw?.secondBoost === false && { secondBoost: false as const }),
    };
}
/** Whether the match is played by the official rules. */
export const officialPlay = (rules: PlayRules) => Object.keys(parsePlayRules(rules)).length === 0;
/** The engine rules a match with these play rules (and, for a room, whether two playables are allowed) starts with. */
export function engineRules(rules: PlayRules & Pick<MatchRules, 'doublePlayable'>): Rules {
    const play = parsePlayRules(rules);
    return {
        ...sandboxRules,
        ...(rules.doublePlayable === true && { doublePlayable: true as const }),
        ...(play.firstSeat !== undefined && { fixedOrder: true as const, firstPlayer: play.firstSeat }),
        ...(play.openingHand && { openingHand: [...play.openingHand] as [number, number] }),
        ...(play.secondBoost === false && { secondBoost: false as const }),
    };
}

/**
 * Ready-made play rules (テンプレート). Not stored anywhere: the one shown as chosen is the one the
 * current rules equal (`presetOf`), so a template and the rules can never disagree. A fixed order
 * matches whichever seat goes first: the owner picks the seat.
 * The handicaps all help the 先攻, for a weaker player fixed as 先攻 against a stronger one.
 */
export type PlayPresetId = 'official' | 'handicap1' | 'handicap2' | 'handicap3';
export const playPresets: readonly { id: PlayPresetId; name: string; rules: PlayRules }[] = [
    { id: 'official', name: '公式', rules: {} },
    { id: 'handicap1', name: 'ハンデ小', rules: { firstSeat: 0, secondBoost: false } },
    { id: 'handicap2', name: 'ハンデ中', rules: { firstSeat: 0, secondBoost: false, openingHand: [3, 3] } },
    { id: 'handicap3', name: 'ハンデ大', rules: { firstSeat: 0, secondBoost: false, openingHand: [4, 3] } },
];
const presetKey = (rules: PlayRules) => {
    const play = parsePlayRules(rules);
    return JSON.stringify([play.firstSeat !== undefined, play.openingHand ?? OFFICIAL_OPENING_HAND, play.secondBoost !== false]);
};
/** The template these play rules equal, or null for custom ones (カスタム). */
export const presetOf = (rules: PlayRules): PlayPresetId | null => playPresets.find(preset => presetKey(preset.rules) === presetKey(rules))?.id ?? null;
/** The play rules of a template, keeping the seat already chosen to go first. */
export function applyPreset(rules: PlayRules, id: PlayPresetId): PlayRules {
    const preset = playPresets.find(entry => entry.id === id)!.rules;
    return parsePlayRules({ ...preset, ...(preset.firstSeat !== undefined && rules.firstSeat !== undefined && { firstSeat: rules.firstSeat }) });
}
/** One line for the lobby and for sharing, e.g. 「先攻：席1 ／ 初期手札：先攻3枚・後攻3枚 ／ 後攻5ターン目+2PP：なし」. Empty for the official rules. */
export function describePlayRules(rules: PlayRules): string {
    const play = parsePlayRules(rules);
    return [
        ...(play.firstSeat !== undefined ? [`先攻：席${play.firstSeat + 1}`] : []),
        ...(play.openingHand ? [`初期手札：先攻${play.openingHand[0]}枚・後攻${play.openingHand[1]}枚`] : []),
        ...(play.secondBoost === false ? ['後攻5ターン目+2PP：なし'] : []),
    ].join(' ／ ');
}
