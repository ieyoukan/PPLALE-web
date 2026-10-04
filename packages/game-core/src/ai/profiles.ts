import type { CpuLevel, CpuStrategy } from './types.ts';

/** Labels are shared by the UI and strategies without importing the search engine. */
export const cpuProfiles: Record<CpuLevel, Pick<CpuStrategy, 'name' | 'description'>> = {
    easy: { name: 'よわい', description: 'すぐ勝てる手や明らかな無駄には気づき、ほかは気まぐれに動きます' },
    normal: { name: 'ふつう', description: 'カードごとの定石で手堅く動きます' },
    hard: { name: 'つよい', description: '打てる手をすべて試し、盤面が一番良くなる手を選びます' },
    master: { name: 'さいきょう', description: 'このターンで勝てる手順があれば必ず見つけます。なければ「つよい」と同じ判断です' },
};
export const cpuLevels: CpuLevel[] = ['easy', 'normal', 'hard', 'master'];
