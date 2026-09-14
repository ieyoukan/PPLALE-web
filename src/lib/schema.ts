import { z } from 'zod';

export const cardTypeSchema = z.enum(['yojo', 'sweet', 'playable']);
export const fruitTypeSchema = z.enum(['all', 'strawberry', 'grape', 'melon', 'orange']);
export const cardRoleSchema = z.enum(['', 'assistant_manager', 'manager']);
export const sweetTypeSchema = z.enum([
  '',
  'animal_soda',
  'cafe',
  'float',
  'doughnut',
  'cake',
  'back_menu',
  'chai',
  'ice_cream',
  'pplale_soda',
  'pplale_yaki',
  'currency',
]);
export const cardVersionSchema = z.enum(['normal', 'beta']);

export const cardSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: cardTypeSchema,
  fruit: fruitTypeSchema,
  cost: z.number().int().nonnegative(),
  hp: z.number().int().nonnegative(),
  attack: z.number().int().nonnegative(),
  description: z.string(),
  imageUrl: z.string().min(1),
  role: cardRoleSchema.optional(),
  sweetType: sweetTypeSchema.optional(),
  effect: z.string().optional(),
  version: cardVersionSchema.optional(),
});

export const yojoDataSchema = z.object({
  yojo: z.array(cardSchema),
});

export const sweetDataSchema = z.object({
  sweet: z.array(cardSchema),
});

export const playableDataSchema = z.object({
  playable: z.array(cardSchema),
});

// デッキ構築には含まれず、ゲームプレイ中の効果で生成される幼女カード（例：少女うゆち、美女うゆち）
export const tokenYojoDataSchema = z.object({
  tokenYojo: z.array(cardSchema),
});

/**
 * Firestore に保存する Deck ドキュメントのスキーマ定義
 * - users/{uid}/decks/{deckId}
 * フィールド:
 * - createdAt: Date (任意、作成日時)
 * - name: string
 * - playableCardId: string | null
 * - sweetDeckIds: string[]
 * - updatedAt: Date (任意、更新日時)
 * - yojoDeckIds: string[]
 */

export const deckSchema = z.object({
  createdAt: z.instanceof(Date).optional(),
  name: z.string().min(1).max(200),
  playableCardId: z.string().nullable(),
  sweetDeckIds: z.array(z.string()).max(10),
  updatedAt: z.instanceof(Date).optional(),
  yojoDeckIds: z.array(z.string()).max(20),
});

export type Deck = z.infer<typeof deckSchema>;

// Helper: validate data and return typed Deck or throw
export function validateDeckData(data: unknown): Deck {
  const parsed = deckSchema.parse(data);
  return parsed;
}

export function parseBooleanFromStorage(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback;

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'boolean' ? parsed : fallback;
  } catch {
    return fallback;
  }
}
