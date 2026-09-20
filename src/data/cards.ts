import { CardInfo } from '@/types/card';
import sweetData from '@/data/sweet.json';
import yojoData from '@/data/yojo.json';
import playableData from '@/data/playable.json';
import tokenYojoData from '@/data/tokenYojo.json';
import {
  playableDataSchema,
  sweetDataSchema,
  tokenYojoDataSchema,
  yojoDataSchema,
} from '@/lib/schema';

const parsedYojoData = yojoDataSchema.parse(yojoData);
const parsedSweetData = sweetDataSchema.parse(sweetData);
const parsedPlayableData = playableDataSchema.parse(playableData);
const parsedTokenYojoData = tokenYojoDataSchema.parse(tokenYojoData);

// 幼女カードデータ
export const allYojoCards: CardInfo[] = parsedYojoData.yojo;

// お菓子カードデータ
export const allSweetCards: CardInfo[] = parsedSweetData.sweet;

export const allPlayableCards: CardInfo[] = parsedPlayableData.playable;

// デッキ構築には含まれない、ゲームプレイ中に生成される幼女カード（少女うゆちなど）
export const allTokenYojoCards: CardInfo[] = parsedTokenYojoData.tokenYojo;