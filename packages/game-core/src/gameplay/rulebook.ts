import { sandboxRules, keywords } from '../model.ts';
import type { Rules } from '../model.ts';
import { playableNow } from '../rules.ts';
import { STALL_TURNS } from '../core/stall.ts';
import { DECK_SIZE, FIELD_SIZE, HAND_LIMIT, MAX_PP, SECOND_PLAYER_BONUS, THRESHOLD_DRAWS } from '../core/constants.ts';
import { keywordDefinitions } from './keywords.ts';

/** Current executable engine contract. Detailed card rulings remain in docs/game-rules.md. */
export function describeRules(rules: Rules = sandboxRules) {
    return {
        version: 'pplale-rules-v1' as const,
        source: 'docs/game-rules.md', implementationNotes: 'docs/card-effect-rules.md',
        setup: {
            ...rules, opening: { first: rules.initialYojo + rules.initialSweet, second: rules.initialYojo + rules.initialSweet + 1,
                chooseDeckEachDraw: true, mulligan: 'one-batch-original-cards-only' },
        },
        limits: { deck: { ...DECK_SIZE }, field: FIELD_SIZE, endTurnHand: HAND_LIMIT, maxPp: MAX_PP },
        turn: { draw: 1, firstTurnDraws: true, chooseDeckEachDraw: true, unusedPp: 'keep-until-own-next-turn',
            secondPlayerBonus: { ...SECOND_PLAYER_BONUS }, order: 'actions-in-any-order-within-cost' },
        points: { lossAt: 0, hungerAt: 5, healingCap: 'player.maxPoints',
            thresholdDraws: THRESHOLD_DRAWS.map(points => ({ points, deck: 'sweet', count: 1, mandatory: true, once: true })),
            steal: { decrease: 'effect-amount', heal: 'effect-amount', blockedBy: ['taunt', 'player-shield'] },
            reduce: { blockedBy: [] }, eat: { blockedBy: ['player-shield'] } },
        end: { deckExhaustionLoss: false, idleTurns: STALL_TURNS, alsoEndWhenCertainlyStuck: true,
            idleWinner: 'more-points', idleTieWinner: 'second-player' },
        timing: { targetSelection: 'pending-choose', reactions: 'pending-other-actor', effects: 'engine-queue-in-text-order',
            placement: 'one-canonical-free-slot-no-rule-effect', randomness: 'seeded-not-exhaustive-outcome-enumeration' },
        keywords: [...keywords],
        abilities: keywords.map(id => ({ id, ...keywordDefinitions[id] })),
        environment: { fruits: [...playableNow.fruits], extendedPlayable: playableNow.extendedPlayable },
    };
}
