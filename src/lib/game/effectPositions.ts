import type { Position, PositionSide } from '@pplale/game-core';

const side = (extra: Partial<PositionSide> = {}): PositionSide => ({
  playable: 'p_0', points: 12, maxPoints: 12, turns: 7, maxPp: 12, pp: 12,
  field: [], hand: [], nap: [], yojo: ['y_37', 'y_9', 'y_52'], sweet: ['s_37', 's_41', 's_42'], ...extra,
});

/** Ready-made boards whose effects can be exercised with the editor's normal controls. */
export const effectPositions: Position[] = [
  {
    version: 1, active: 0, first: 0, title: 'ぶどう：公開手札とおにごっこ',
    note: 'ほーずきを出し、レンス2枚を選んで「公開を完了」。確定前はもう一度押すと取り消せます。相手ふろんとのおにごっこは、レンテのExスキルで出目を指定できます。',
    players: [
      side({ field: [{ id: 'y_49' }], hand: ['y_31', 'y_60', 'y_60', 'y_39', 's_6'], played: ['s_7'], exSkills: { dice: { uses: 2 } } }),
      side({ field: [{ id: 'y_49' }], hand: ['y_33', 'y_64'], exSkills: { dice: { uses: 2 } } }),
    ],
  },
  {
    version: 1, active: 0, first: 0, title: 'オレンジ：色おに・除外・Exスキル',
    note: 'ほとり丸の攻撃と全体ダメージをぶらんちゃんの色おにが防ぎます。くくでキラチャンやおうかを除外して効果を確認できます。りんまるは3種類のExスキルからアリスを獲得します。',
    players: [
      side({ field: [{ id: 'y_147' }], hand: ['y_136', 'y_116', 'y_117', 'y_138', 'y_142'], nap: ['y_29'], ice: 4, acorns: 2, exSkills: { dice: { uses: 1 }, healing: { uses: 3 }, abyss: { uses: 2 } } }),
      side({ field: [{ id: 'y_145' }], hand: ['s_6'] }),
    ],
  },
];
