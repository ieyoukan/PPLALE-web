import { z } from 'zod';
const conditionSchema = z.discriminatedUnion('type', [
    z.strictObject({
        type: z.literal('played_card_before_this'),
        cardId: z.string().min(1),
        during: z.literal('current_game'),
    }),
    z.strictObject({
        type: z.literal('played_yojo_count_before_this'),
        during: z.literal('current_battle'),
        from: z.literal('hand'),
        fruit: z.enum(['strawberry', 'grape', 'melon', 'orange']),
        nameIncludes: z.string().min(1),
        atLeast: z.number().int().positive(),
    }),
]);
type Action = {
    type: 'steal_sweets_points' | 'reduce_sweets_points';
    target: 'opponent';
    amount: number;
} | {
    type: 'damage_yojo';
    target: 'all_opponent_yojo';
    amount: number;
} | {
    type: 'modify_stats';
    target: 'self';
    attack: number;
    hp: number;
} | {
    type: 'grant_keyword';
    target: 'self';
    keyword: 'fast_eater';
} | {
    type: 'if';
    condition: z.infer<typeof conditionSchema>;
    then: Action[];
};
const actionSchema: z.ZodType<Action> = z.lazy(() => z.discriminatedUnion('type', [
    z.strictObject({
        type: z.literal('steal_sweets_points'),
        target: z.literal('opponent'),
        amount: z.number().int().positive(),
    }),
    z.strictObject({
        type: z.literal('reduce_sweets_points'),
        target: z.literal('opponent'),
        amount: z.number().int().positive(),
    }),
    z.strictObject({
        type: z.literal('damage_yojo'),
        target: z.literal('all_opponent_yojo'),
        amount: z.number().int().positive(),
    }),
    z.strictObject({
        type: z.literal('modify_stats'),
        target: z.literal('self'),
        attack: z.number().int(),
        hp: z.number().int(),
    }),
    z.strictObject({
        type: z.literal('grant_keyword'),
        target: z.literal('self'),
        keyword: z.literal('fast_eater'),
    }),
    z.strictObject({
        type: z.literal('if'),
        condition: conditionSchema,
        then: z.array(actionSchema).min(1),
    }),
]));
export const cardEffectsSchema = z.strictObject({
    version: z.literal(1),
    cards: z.record(z.string(), z.strictObject({
        abilities: z.array(z.strictObject({
            trigger: z.enum(['on_play', 'enter_field_from_hand']),
            actions: z.array(actionSchema).min(1),
        })).min(1),
    })),
});
export type CardEffects = z.infer<typeof cardEffectsSchema>;
