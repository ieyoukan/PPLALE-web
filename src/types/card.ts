/**
 * カードの種類を定義する型
 */
export type CardType = 'yojo' | 'sweet' | 'playable';
export type FruitType = 'all' | 'strawberry' | 'grape' | 'melon' | 'orange';
export type CardRole = '' | 'assistant_manager' | 'manager';
export type SweetType =
  | ''
  | 'animal_soda'
  | 'cafe'
  | 'float'
  | 'doughnut'
  | 'cake'
  | 'back_menu'
  | 'chai'
  | 'ice_cream'
  | 'pplale_soda'
  | 'pplale_yaki'
  | 'currency';
export type CardVersion = 'normal' | 'beta';

/**
 * カードの情報を表すインターフェース
 */
export interface CardInfo {
  /** カードのID */
  id: string;
  /** カードの名前 */
  name: string;
  /** カードの種類（幼女またはお菓子） */
  type: CardType;
  /** フルーツの種類 */
  fruit: FruitType;
  /** コスト */
  cost: number;
  /** HP */
  hp: number;
  /** 攻撃力 */
  attack: number;
  /** カードの説明文 */
  description: string;
  /** カードの画像URL */
  imageUrl: string;
  /** 役職 */
  role?: CardRole;
  /** お菓子タイプ */
  sweetType?: SweetType;
  /** 効果 */
  effect?: string;
  /** バージョン */
  version?: CardVersion;
}

/**
 * デッキの情報を表すインターフェース
 */
export interface Deck {
  /** デッキのID */
  id: string;
  /** デッキの名前 */
  name: string;
  /** デッキに含まれるカードのIDリスト */
  cardIds: string[];
  /** デッキの作成日時 */
  createdAt: string;
  /** デッキの更新日時 */
  updatedAt: string;
}
