import { CardInfo } from '@/types/card';
import sweetData from '@/data/en/sweet.json';
import yojoData from '@/data/en/yojo.json';
import playableData from '@/data/en/playable.json';
import tokenYojoData from '@/data/en/tokenYojo.json';
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

export const allEnglishYojoCards: CardInfo[] = parsedYojoData.yojo;
export const allEnglishSweetCards: CardInfo[] = parsedSweetData.sweet;
export const allEnglishPlayableCards: CardInfo[] = parsedPlayableData.playable;
export const allEnglishTokenYojoCards: CardInfo[] = parsedTokenYojoData.tokenYojo;
