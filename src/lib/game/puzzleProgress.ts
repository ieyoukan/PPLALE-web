// 通常のパズルと入門ミッションが共有する、端末内のクリア記録。
export const PUZZLE_PROGRESS_KEY = 'pplale-lethal-cleared-v1';
export const PUZZLE_PROGRESS_EVENT = 'pplale-puzzle-progress';

export function puzzleProgressSnapshot(): string {
  try { return localStorage.getItem(PUZZLE_PROGRESS_KEY) ?? '[]'; }
  catch { return '[]'; }
}

export function parsePuzzleProgress(snapshot: string | null): string[] {
  try {
    const value: unknown = JSON.parse(snapshot ?? '[]');
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string'))] : [];
  } catch { return []; }
}

/** 保存できない場合も挑戦は続けられる。呼び出し元で保存失敗を表示する。 */
export function markPuzzleCleared(id: string): boolean {
  try {
    const cleared = parsePuzzleProgress(puzzleProgressSnapshot());
    localStorage.setItem(PUZZLE_PROGRESS_KEY, JSON.stringify([...new Set([...cleared, id])]));
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(PUZZLE_PROGRESS_EVENT));
    return true;
  } catch { return false; }
}
