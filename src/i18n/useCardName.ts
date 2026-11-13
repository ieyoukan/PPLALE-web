'use client';

// カード名を表示中の言語で返す。ゲームの画面は日本語のカタログ（displayCards）を使うため、英語のときだけ英語名に置き換える。
import { getCardCatalog } from '@/data/catalog';
import { useI18n } from './LocaleProvider';

let englishNames: Map<string, string> | null = null;
const sameName = (_id: string, name: string) => name;
const englishName = (id: string, name: string) => {
  if (!englishNames) {
    const { allYojoCards, allSweetCards, allPlayableCards, allTokenYojoCards } = getCardCatalog('en');
    englishNames = new Map([...allYojoCards, ...allSweetCards, ...allPlayableCards, ...allTokenYojoCards].map(card => [card.id, card.name]));
  }
  return englishNames.get(id) ?? name;
};

/** `(id, japaneseName)` → the card's name in the current language (the Japanese name for unknown ids, tokens without English, or in Japanese). */
export function useCardName() {
  return useI18n().locale === 'en' ? englishName : sameName;
}
