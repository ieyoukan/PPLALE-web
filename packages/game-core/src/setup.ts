// Deck validation and creating a new match.
import { note, spawnCard } from './core/cards.ts';
import { shuffled } from './core/rng.ts';
import { sides } from './model.ts';
import type { Catalog, Deck, GameState, Player, Rules } from './model.ts';
import { playableSkills, skillsFor } from './playables/skills.ts';
import { implementedCard, implementedFruits } from './cards/registry.ts';

/**
 * Decks use cards of the implemented fruits and an implemented playable. Which fruits and whether a
 * 拡張プレイアブル are allowed in a match is decided by its rules (rules.ts `deckRuleErrors`).
 */
export function validateDeck(deck: Deck, catalog: Catalog): string[] {
    const errors: string[] = [];
    if (deck.yojo.length !== 20) errors.push('幼女デッキは20枚にしてください');
    if (deck.sweet.length !== 10) errors.push('お菓子デッキは10枚にしてください');
    for (const kind of ['yojo', 'sweet'] as const) {
        for (const id of deck[kind]) {
            const c = catalog[id];
            if (!c || c.type !== kind || !implementedFruits.includes(c.fruit) || !implementedCard(id) || !(kind === 'yojo' ? /^y_\d+$/ : /^s_\d+$/).test(id))
                errors.push(`${id}: 対応している${kind === 'yojo' ? '幼女' : 'お菓子'}デッキに入れられません`);
        }
    }
    if (catalog[deck.playable]?.type !== 'playable' || !(deck.playable in playableSkills)) errors.push('使えるプレイアブルを選んでください');
    for (const id of Array.from(new Set(deck.sweet))) {
        if (catalog[id]?.sweetType === 'animal_soda' && deck.sweet.filter(c => c === id).length > 1) errors.push(`${catalog[id].name}は1枚までです`);
        if (/^s_(28|29|30|31)$/.test(id) && deck.sweet.filter(c => c === id).length > 1) errors.push(`${catalog[id].name}は1枚までです`);
        if (id === 's_24' && [...deck.yojo, ...deck.sweet].some(id => catalog[id]?.fruit === 'orange')) errors.push('ぷぷりえーるはオレンジ環境以降では使用できません');
    }
    return Array.from(new Set(errors));
}

/** Starts at the dice phase; nobody has drawn yet. */
export function newGame(decks: [Deck, Deck], catalog: Catalog, rules: Rules, seed: number): GameState {
    if (decks.some(d => [...d.yojo, ...d.sweet].some(id => catalog[id]?.fruit === 'orange')) && decks.some(d => d.sweet.includes('s_24')))
        throw new Error('ぷぷりえーるはオレンジ環境以降では使用できません');
    for (const d of decks) {
        const errors = validateDeck(d, catalog);
        if (errors.length) throw new Error(errors.join(' / '));
    }
    const players = decks.map((d): Player => ({
        name: d.name, yojo: [], sweet: [], hand: [], field: [], nap: [], exile: [], playable: d.playable,
        points: rules.initialPoints, maxPoints: rules.initialPoints, turns: 0, pp: 0, ppBonus: 0, turnPpBonus: 0, nextPpDebt: 0,
        milestones: [], played: [], shield: false, sweetBoost: 0, skills: skillsFor(d.playable).map(s => s.uses), lastBorrow: -10,
    })) as [Player, Player];
    const s: GameState = {
        version: 1, effectTauntRules: true, turnRules: true, phase: 'dice', openingRemaining: [0, 0], mulligan: { eligible: [[], []], confirmed: [false, false] }, dice: null,
        rules: { ...rules }, rng: seed >>> 0, serial: 0, revision: 0, active: rules.firstPlayer, turn: 0,
        players, cards: {}, queue: [], pending: null, winner: null, log: [],
    };
    for (const side of sides) {
        for (const kind of ['yojo', 'sweet'] as const) s.players[side][kind] = shuffled(s, decks[side][kind].map(id => spawnCard(s, id)));
    }
    note(s, 'ダイスを振って先攻・後攻を決めてください');
    return s;
}
