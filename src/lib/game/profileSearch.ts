// 名前検索の正規化。プロフィール保存時（ブラウザ）と検索API（サーバー）で同じ規則を使う。

export const MAX_NAME_LENGTH = 12;
/** Every substring of a 12-character name: 12 + 11 + … + 1. Firestore rules cap the list at this size. */
export const MAX_NAME_GRAMS = (MAX_NAME_LENGTH * (MAX_NAME_LENGTH + 1)) / 2;
export const SEARCH_LIMIT = 20;

/** Width, case and katakana/hiragana do not matter: 「ププ」「ぷぷ」「ﾌﾟﾌﾟ」 are the same, and spaces are ignored. */
export function foldName(value: string): string {
  return value.normalize('NFKC').toLowerCase()
    .replace(/[ァ-ヶ]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .replace(/[\s\p{C}]/gu, '');
}

/** The searchable pieces of a name: each substring once, so any part of it finds the profile with `array-contains`. */
export function nameGrams(name: string): string[] {
  const chars = Array.from(foldName(name)).slice(0, MAX_NAME_LENGTH), grams = new Set<string>();
  for (let start = 0; start < chars.length; start++) for (let end = start + 1; end <= chars.length; end++) grams.add(chars.slice(start, end).join(''));
  return [...grams];
}

/** A profile link or bare id pasted into the search box, as the profile id it names. */
export function profileIdFrom(value: string): string | null {
  const text = value.trim();
  try {
    const url = new URL(text);
    const id = url.searchParams.get('id') ?? url.pathname.match(/^\/u\/([\w-]{1,128})\/?$/)?.[1];
    return id && /^[\w-]{1,128}$/.test(id) ? id : null;
  } catch { return /^[\w-]{20,128}$/.test(text) ? text : null; }
}
