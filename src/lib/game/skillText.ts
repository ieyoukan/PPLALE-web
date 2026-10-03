/**
 * The description of skill `index` from a playable's printed text, which lists one skill per line:
 * 「・固有スキル1:【名前】コスト3, 効果。使用回数制限1回。」→「効果。」
 */
export function skillDescription(effect: string | undefined, index: number): string {
  return effect?.split('\n')[index]
    ?.replace(/^.*?】/, '')
    .replace(/コスト\d+[,、]\s*/, '')
    .replace(/使用回数制限\d+回。?/, '') ?? '';
}
