import type { AppLocale } from '@/i18n/config';
import {
  allPlayableCards,
  allSweetCards,
  allTokenYojoCards,
  allYojoCards,
} from './cards';
import {
  allEnglishPlayableCards,
  allEnglishSweetCards,
  allEnglishTokenYojoCards,
  allEnglishYojoCards,
} from './cards.en';

const catalogs = {
  ja: { allYojoCards, allSweetCards, allPlayableCards, allTokenYojoCards },
  en: {
    allYojoCards: allEnglishYojoCards,
    allSweetCards: allEnglishSweetCards,
    allPlayableCards: allEnglishPlayableCards,
    allTokenYojoCards: allEnglishTokenYojoCards,
  },
} as const;

export function getCardCatalog(locale: AppLocale) {
  return catalogs[locale];
}
