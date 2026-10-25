import type { Catalog } from '../model.ts';
import { WIN } from './evaluate.ts';
import type { Evaluator } from './value.ts';
import { observeGame } from '../gameplay/observation.ts';
import { researchCatalog } from '../research/cards.ts';
import { encodeObservation } from '../research/encode.ts';
import { researchSchema } from '../research/schema.ts';
import type { EncodedObservation, ResearchCatalog, ResearchObservation, ResearchSchema } from '../research/types.ts';

/** A model or hand-written scorer consumes exactly the same data as the Python reader. */
export type ResearchScorer = (encoded: EncodedObservation, observation: ResearchObservation) => number;

/** Experimental opt-in evaluator. Registered CPU strategies keep their legacy models. */
export function createResearchEvaluator(score: ResearchScorer, schema: ResearchSchema = researchSchema): Evaluator {
    const catalogs = new WeakMap<Catalog, ResearchCatalog>();
    return (state, side, catalog) => {
        if (state.winner === 'draw') return 0;
        if (state.winner !== null) return state.winner === side ? WIN : -WIN;
        let profiles = catalogs.get(catalog);
        if (!profiles) { profiles = researchCatalog(catalog); catalogs.set(catalog, profiles); }
        const observation = observeGame(state, side, catalog);
        const value = score(encodeObservation(observation, profiles, schema), observation);
        if (!Number.isFinite(value)) throw new Error('Research evaluator returned a non-finite score');
        return value;
    };
}
