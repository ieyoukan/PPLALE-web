import lessons from '@/data/introPuzzles.json';

// ルームの初心者マークではゲームエンジンを読み込まない。
export const introLessons = lessons;
export const MISSIONS_PATH = '/game/missions/';

export function introProgress(cleared: readonly string[]) {
  const completed = lessons.filter(lesson => cleared.includes(lesson.id)).length;
  return { completed, total: lessons.length, done: completed === lessons.length, next: lessons.find(lesson => !cleared.includes(lesson.id)) };
}
