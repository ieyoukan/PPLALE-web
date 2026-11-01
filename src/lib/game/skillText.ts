import { getCardCatalog } from '@/data/catalog';
import type { CardInfo } from '@/types/card';

// A playable's printed text lists one thing per line: its skills (共通スキル1, 固有スキル1 …), and for
// the 拡張プレイアブル also a 固有パッシブスキル and its MP (初期MP3 / 最大MP20).
const lines = (effect: string | undefined) => effect?.split('\n') ?? [];
/** 「【名前】」 and what the skill panel shows next to the text: the cost and the use limit. */
const body = (line: string | undefined) => line
  ?.replace(/^.*?】/, '')
  .replace(/(コスト|消費MP)\d+[,、，]\s*/, '')
  .replace(/使用回数制限\d+回。?/, '') ?? '';

/**
 * The description of skill `index` (0: the common skill) from a playable's printed text:
 * 「・固有スキル1:【名前】コスト3, 効果。使用回数制限1回。」→「効果。」
 */
export function skillDescription(effect: string | undefined, index: number): string {
  return body(lines(effect).filter(line => /スキル\d/.test(line))[index]);
}

/** The description of the 固有パッシブスキル, or '' for a playable without one. */
export function passiveDescription(effect: string | undefined): string {
  return body(lines(effect).find(line => line.includes('パッシブスキル')));
}

// The English printed text: 「Common skill 1 : 【Name】 Cost 0 Text. Usage limit: 2 times」, one skill per line
// (a line not starting a skill, e.g. 「Common skill 1.」 ending a sentence, continues the one before).
const englishLines = (effect: string | undefined) => (effect?.split('\n') ?? []).reduce<string[]>((all, line) => {
  if (!all.length || /^[・\s]*((Common|Unique)( passive)? skill\s*\d*\s*:|Starting MP)/i.test(line)) all.push(line);
  else all[all.length - 1] += ` ${line}`;
  return all;
}, []);
const englishBody = (line: string | undefined) => line
  ?.replace(/^.*?】/, '')
  .replace(/^\s*(MP Cost:|Cost)\s*\d+\s*,?\s*/i, '')
  .replace(/\s*Usage limit:\s*\d+ times?\.?/i, '')
  .trim() ?? '';

/** {@link skillDescription} for an English printed text. */
export function englishSkillDescription(effect: string | undefined, index: number): string {
  return englishBody(englishLines(effect).filter(line => /skill\s*\d+\s*:/i.test(line))[index]);
}

/** {@link passiveDescription} for an English printed text. */
export function englishPassiveDescription(effect: string | undefined): string {
  return englishBody(englishLines(effect).find(line => /passive skill\s*:/i.test(line)));
}

let englishCards: Map<string, CardInfo> | null = null;
/** The English card (name, printed text, image) for the board in English; undefined for cards without one (some tokens). */
export function englishCard(id: string): CardInfo | undefined {
  if (!englishCards) {
    const { allYojoCards, allSweetCards, allPlayableCards, allTokenYojoCards } = getCardCatalog('en');
    englishCards = new Map([...allYojoCards, ...allSweetCards, ...allPlayableCards, ...allTokenYojoCards].map(card => [card.id, card as CardInfo]));
  }
  return englishCards.get(id);
}
