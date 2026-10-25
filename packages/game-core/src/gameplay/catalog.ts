import { implementedCard, scriptOf } from '../cards/registry.ts';
import { playableSkills, playablePassives, playableMp, skillsFor } from '../playables/skills.ts';
import { exSkillInfo } from '../playables/exSkills.ts';
import { deckCard, singleCopy } from '../setup.ts';
import { playableNow, isExtendedPlayable, cardAllowedInMatch } from '../rules.ts';
import type { MatchRules } from '../rules.ts';
import type { Catalog } from '../model.ts';

export function describeCard(catalog: Catalog, id: string, environment: MatchRules = playableNow) {
    const d = catalog[id];
    if (!d) throw new Error(`Unknown card: ${id}`);
    const script = scriptOf(id);
    const playable = d.type === 'playable';
    const registered = playable ? Object.hasOwn(playableSkills, id) : implementedCard(id);
    const kind = d.type === 'yojo' || d.type === 'sweet' ? d.type : null;
    const deckKind = kind && deckCard(catalog, id, kind) ? kind : null;
    const extended = playable && isExtendedPlayable(catalog, id);
    const allowed = cardAllowedInMatch(catalog, id, environment);
    return {
        id, name: d.name, type: d.type, fruit: d.fruit, cost: d.cost, attack: d.attack, hp: d.hp,
        effect: d.effect ?? '', role: d.role ?? '', printVersion: d.version ?? 'normal', sweetType: d.sweetType ?? null,
        implementation: { registered, hooks: Object.entries(script)
            .filter(([key, value]) => (key.startsWith('on') || key === 'afterPlay') && typeof value === 'function')
            .map(([key]) => key).sort(), operations: Object.keys(script.ops ?? {}).sort(), customEffect: !!script.effect },
        deck: { kind: deckKind, allowed, copyLimit: singleCopy(catalog, id) ? 1 : null, extended },
        play: playable ? null : { from: 'hand', command: 'play', cost: 'current-costOf', placement: d.type === 'yojo' ? 'first-free-slot' : null,
            conditional: !!script.canPlay, variableCost: !!script.baseCost, choices: 'pending-choose', reactionBeforePayment: d.type === 'yojo' && !!script.onPlay },
        abilities: {
            keywords: [...(script.keywords ?? [])].sort(), evasion: script.evasion ?? null,
            actionsPerTurn: script.actionsPerTurn ?? 1, maxDamage: script.maxDamage ?? null,
            unharmedAttacking: script.unharmedAttacking ?? false, revealable: script.revealable ?? false,
        },
        skills: playable && registered ? skillsFor(id).map((skill, index) => ({
            index, name: skill.name, pp: skill.cost, mp: skill.mp ?? 0, uses: skill.uses ?? null,
            reaction: skill.reaction ?? null, conditional: !!skill.blocked,
            command: skill.reaction ? 'choose' : 'skill',
        })) : [],
        passive: playablePassives[id] ? { name: playablePassives[id].name, conditional: !!playablePassives[id].active,
            changesSkillCost: !!playablePassives[id].skillCost, changesSkillUses: !!playablePassives[id].extraUses,
            onUnitEnter: !!playablePassives[id].onUnitEnter } : null,
        mp: playableMp[id] ? { ...playableMp[id] } : null,
    };
}

export type CardDefinition = ReturnType<typeof describeCard>;
export const listCardDefinitions = (catalog: Catalog, environment: MatchRules = playableNow): CardDefinition[] =>
    Object.keys(catalog).sort().map(id => describeCard(catalog, id, environment));
export const listExSkills = () => Object.entries(exSkillInfo).map(([id, info]) => ({ id, ...info }));
