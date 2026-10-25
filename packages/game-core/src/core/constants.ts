// Shared by execution and the machine-readable rulebook. These are engine rules, not AI weights.
export const MAX_PP = 12;
export const FIELD_SIZE = 7;
export const DECK_SIZE = { yojo: 20, sweet: 10 } as const;
export const HAND_LIMIT = 9;
export const THRESHOLD_DRAWS = [10, 5] as const;
export const SECOND_PLAYER_BONUS = { turn: 5, pp: 2 } as const;
