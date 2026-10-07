import type { CpuLevel, CpuStrategy } from './types.ts';

/** Labels are shared by the UI and strategies without importing the search engine. */
export const cpuProfiles: Record<CpuLevel, Pick<CpuStrategy, 'name' | 'description'>> = {
    easy: { name: 'よわい', description: 'すぐ勝てる手や明らかな無駄には気づき、ほかは気まぐれに動きます' },
    normal: { name: 'ふつう', description: 'カードごとの定石で手堅く動きます' },
    hard: { name: 'つよい', description: 'このターンで確実に勝てる手順があれば見逃さず、ほかは打てる手をすべて試して盤面が一番良くなる手を選びます' },
    master: { name: 'さいきょう', description: '手札とデッキを踏まえて連続行動と相手の返しを読み、盤面とお菓子ポイントの両方を狙います' },
};
export const cpuLevels: CpuLevel[] = ['easy', 'normal', 'hard', 'master'];
