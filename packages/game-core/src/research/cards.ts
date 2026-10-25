import { scriptOf } from '../cards/registry.ts';
import { describeCard } from '../gameplay/catalog.ts';
import type { Catalog } from '../model.ts';
import type { ResearchCard, ResearchCatalog } from './types.ts';

/** Definitions + script metadata only. Never executes a card to guess its effects. */
export function researchCard(catalog: Catalog, id: string): ResearchCard {
    const d = catalog[id];
    if (!d) throw new Error(`Unknown research card: ${id}`);
    const script = scriptOf(id);
    const definition = describeCard(catalog, id), abilities = definition.abilities;
    return {
        id, name: definition.name, effect: definition.effect, role: definition.role, printVersion: definition.printVersion,
        deck: definition.deck, play: definition.play, skills: definition.skills, passive: definition.passive,
        type: d.type, fruit: d.fruit, cost: d.cost, attack: d.attack, hp: d.hp,
        sweetType: d.sweetType ?? null,
        keywords: abilities.keywords, hooks: definition.implementation.hooks,
        evasion: abilities.evasion, actionsPerTurn: abilities.actionsPerTurn,
        maxDamage: abilities.maxDamage, unharmedAttacking: abilities.unharmedAttacking,
        revealable: abilities.revealable, variableCost: !!definition.play?.variableCost,
        implemented: definition.implementation.registered,
        // No annotation is different from an explicitly empty (vanilla) effect list.
        coverage: script.research?.coverage ?? 'unannotated',
        effects: JSON.parse(JSON.stringify(script.research?.effects ?? [])),
    };
}

export function researchCatalog(catalog: Catalog): ResearchCatalog {
    return Object.fromEntries(Object.keys(catalog).sort().map(id => [id, researchCard(catalog, id)]));
}
