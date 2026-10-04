// Deck validation and creating a new match.
import { note, spawnCard } from './core/cards.ts';
import { shuffled } from './core/rng.ts';
import { sides } from './model.ts';
import type { Catalog, Deck, GameState, Player, Rules } from './model.ts';
import { playableSkills, skillsFor } from './playables/skills.ts';

/** Currently only strawberry decks with a normal playable are supported. */
export function validateDeck(deck: Deck, catalog: Catalog): string[] {
    const errors: string[] = [];
    if (deck.yojo.length !== 20) errors.push('幼女デッキは20枚にしてください');
    if (deck.sweet.length !== 10) errors.push('お菓子デッキは10枚にしてください');
    for (const kind of ['yojo', 'sweet'] as const) {
        for (const id of deck[kind]) {
            const c = catalog[id];
            if (!c || c.type !== kind || c.fruit !== 'strawberry' || !(kind === 'yojo' ? /^y_(?:\d|[12]\d|30)$/ : /^s_(?:\d|1\d|2[0-7])$/).test(id))
                errors.push(`${id}: いちごの${kind === 'yojo' ? '幼女' : 'お菓子'}デッキに入れられません`);
        }
    }
    if (!catalog[deck.playable] || !(deck.playable in playableSkills)) errors.push('通常プレイアブルを選んでください');
    for (const id of Array.from(new Set(deck.sweet))) {
        if (catalog[id]?.sweetType === 'animal_soda' && deck.sweet.filter(c => c === id).length > 1) errors.push(`${catalog[id].name}は1枚までです`);
    }
    return Array.from(new Set(errors));
}

/** Starts at the dice phase; nobody has drawn yet. */
export function newGame(decks: [Deck, Deck], catalog: Catalog, rules: Rules, seed: number): GameState {
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
