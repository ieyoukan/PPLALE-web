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
