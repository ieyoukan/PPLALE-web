// 保存処理の共通部品。カードのスキーマやZodには依存させない。
export function parseBooleanFromStorage(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback;

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'boolean' ? parsed : fallback;
  } catch {
    return fallback;
  }
}
