import { attackOf, costOf, hpOf, immobilized, maxPp } from '../core/cards.ts';
import { fruitsOf } from '../core/protection.ts';
import { actionCost } from '../core/actions.ts';
import { commandKey, inspectActions, legalActions as legalMoves } from './actions.ts';
import { HIDDEN_CARD, viewFor } from '../redact.ts';
import { other } from '../model.ts';
import type { Catalog, Command, GameState, Side } from '../model.ts';
import { OBSERVATION_VERSION } from './types.ts';
import type { ObservedAction, ObservedCard, ObservedPlayer, GameObservation } from './types.ts';

const zones = ['hand', 'field', 'nap', 'exile'] as const;

/** Explicit projection of a redacted state. Never spreads an engine player/card/task into data. */
export function observeDecision(state: GameState, viewer: Side, catalog: Catalog, selected?: Command, options: { diagnostics?: boolean; actions?: boolean } = {}): {
    observation: GameObservation; selectedAction: number | null;
} {
    const s = viewFor(state, viewer), order = [viewer, other(viewer)] as const;
    const relative = (side: Side): 0 | 1 => side === viewer ? 0 : 1;
    const refs = new Map<string, string>();
    for (const [side, actual] of order.entries()) for (const zone of zones)
        s.players[actual][zone].forEach((uid, index) => refs.set(uid, `${side}.${zone}.${index}`));
    // Own deck-search choices are revealed by viewFor; still do not expose their deck positions/uids.
    for (const [index, option] of (s.pending?.options ?? []).entries())
        if (s.cards[option.id] && !refs.has(option.id)) refs.set(option.id, `choice.${index}`);
    const ref = (uid: string | undefined): string | null => uid ? refs.get(uid) ?? null : null;
    const cards: ObservedCard[] = [];
    const observeCard = (uid: string, actual: Side, zone: ObservedCard['zone']): ObservedCard => {
        const c = s.cards[uid], known = c.cardId !== HIDDEN_CARD && !!catalog[c.cardId];
        return {
            ref: refs.get(uid)!, cardId: known ? c.cardId : null, side: relative(actual), zone,
            current: !known ? null : {
                cost: costOf(s, uid, catalog, actual), attack: attackOf(c, catalog), hp: hpOf(c, catalog),
                damage: c.damage, attackBonus: c.attackBonus, hpBonus: c.hpBonus,
                costDelta: c.costDelta, temporaryCost: c.temporaryCost, keywords: [...c.keywords].sort(),
                fruits: fruitsOf(s, uid, catalog).sort(), exhausted: c.exhausted, enteredThisTurn: c.entered === s.turn,
                entered: c.entered, ateOn: c.ateOn, immobileUntil: c.immobileUntil ?? null,
                immobile: immobilized(s, uid) || c.keywords.includes('immobile'), shield: c.shield,
                hiding: c.hiding ?? false, silenced: c.silenced ?? false, revealed: c.revealed,
                evasion: c.evasion ?? null, actions: c.actions ?? 0,
                owner: relative(c.owner ?? actual), timedFruits: { ...(c.timedFruits ?? {}) },
                links: c.links.flatMap(uid => ref(uid) ? [ref(uid)!] : []),
            },
        };
    };
    const observedPlayers = order.map(actual => {
        const p = s.players[actual];
        for (const zone of zones) for (const uid of p[zone]) cards.push(observeCard(uid, actual, zone));
        return {
            side: relative(actual), playable: p.playable, points: p.points, maxPoints: p.maxPoints,
            pp: p.pp, maxPp: maxPp(s, actual), turns: p.turns, nextPpDebt: p.nextPpDebt,
            handCount: p.hand.length, yojoCount: p.yojo.length, sweetCount: p.sweet.length,
            shield: p.shield, skills: [...p.skills], skillHistory: [...(p.skillHistory ?? [])],
            extraSkills: (p.extraSkills ?? []).map(skill => ({ ...skill })),
            exSkills: JSON.parse(JSON.stringify(p.exSkills ?? {})),
            played: [...p.played], milestones: [...p.milestones], lastingFruits: [...(p.lastingFruits ?? [])],
            resources: {
                mp: p.mp ?? 0, ice: p.ice ?? 0, acorns: p.acorns ?? 0, sweetBoost: p.sweetBoost,
                entryBuff: p.entryBuff ?? 0, discardedYojo: p.discardedYojo ?? 0, skipDraw: p.skipDraw ?? 0,
                mochidaLeft: p.mochidaLeft ?? 0, turnPpBonus: p.turnPpBonus ?? 0,
                strawberryOnlyUntil: p.strawberryOnlyUntil ?? -1,
            },
        } satisfies ObservedPlayer;
    });
    const players: [ObservedPlayer, ObservedPlayer] = [observedPlayers[0], observedPlayers[1]];
    for (const option of s.pending?.options ?? []) if (refs.get(option.id)?.startsWith('choice.'))
        cards.push(observeCard(option.id, s.pending!.task.actor, 'choice'));
    const choiceOptions = (s.pending?.options ?? []).map((option, index) => ({
        ref: `option.${index}`, value: s.cards[option.id] ? null : option.id, card: ref(option.id),
    }));
    if (options.actions === false && (selected || options.diagnostics)) throw new Error('Action selection/diagnostics require action enumeration');
    const moves = options.actions === false ? [] : legalMoves(state, viewer, catalog);
    const project = (c: Command, id: string): ObservedAction => {
        const selectedOption = c.type === 'choose' ? s.pending?.options.findIndex(option => option.id === c.option) ?? -1 : -1;
        return {
            id, type: c.type, source: 'uid' in c ? ref(c.uid) : null,
            target: c.type === 'attack' ? ref(c.target) : null,
            targetLeader: c.type === 'attack' && c.target === 'leader',
            option: selectedOption >= 0 ? `option.${selectedOption}` : null,
            deck: 'deck' in c ? c.deck : null, mode: c.type === 'acorn' ? c.mode : null,
            skill: c.type === 'exSkill' ? c.skill : null, index: c.type === 'skill' ? c.index : null,
            order: c.type === 'initiative' ? c.order : null,
            cards: c.type === 'mulligan' ? c.uids.map(uid => ref(uid)!) : [],
            cost: actionCost(state, c, catalog),
        };
    };
    const actions = moves.map(({ command }, index) => project(command, `action.${index}`));
    const unavailable = options.diagnostics ? inspectActions(state, viewer, catalog).flatMap((candidate, index) =>
        candidate.error ? [{ ...project(candidate.command, `candidate.${index}`), error: candidate.error }] : []) : undefined;
    const selectedAction = selected ? moves.findIndex(move => commandKey(move.command) === commandKey(selected)) : null;
    if (selectedAction === -1) throw new Error('Selected research command is not a legal action');
    return {
        observation: {
            version: OBSERVATION_VERSION, phase: s.phase, turn: s.turn, active: relative(s.active), first: relative(s.rules.firstPlayer),
            winner: s.winner === null || s.winner === 'draw' ? s.winner : relative(s.winner),
            players, cards,
            pending: s.pending ? { actor: relative(s.pending.task.actor), operation: s.pending.task.op,
                source: ref(s.pending.task.source), step: s.pending.task.step ?? null,
                amount: s.pending.task.amount ?? null, hp: s.pending.task.hp ?? null,
                count: s.pending.task.count ?? null, keyword: s.pending.task.keyword ?? null, options: choiceOptions } : null,
            actions,
            ...(unavailable === undefined ? {} : { unavailable }),
        },
        selectedAction,
    };
}

export const observeGame = (state: GameState, viewer: Side, catalog: Catalog): GameObservation =>
    observeDecision(state, viewer, catalog).observation;

/** Value functions need state facts only; enumerating and simulating every action at each leaf is wasteful. */
export const observeState = (state: GameState, viewer: Side, catalog: Catalog): GameObservation =>
    observeDecision(state, viewer, catalog, undefined, { actions: false }).observation;
