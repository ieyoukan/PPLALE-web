import { expect } from '@playwright/test';
import { encodePosition } from '../../packages/game-core/dist/index.js';

const side = (extra = {}) => ({
  playable: 'p_0', points: 12, maxPoints: 12, turns: 7, maxPp: 12, pp: 12,
  field: [], hand: [], nap: [], yojo: ['y_37', 'y_9', 'y_52'], sweet: ['s_37', 's_41', 's_42'], ...extra,
});

export const grapeBoard = {
  version: 1, active: 0, first: 0,
  players: [
    side({ field: [{ id: 'y_49' }], hand: ['y_31', 'y_60', 'y_60', 'y_39', 's_6'], played: ['s_7'], exSkills: { dice: { uses: 2 } } }),
    side({ field: [{ id: 'y_49' }], hand: ['y_33', 'y_64'], exSkills: { dice: { uses: 2 } } }),
  ],
};

export const orangeBoard = {
  version: 1, active: 0, first: 0,
  players: [
    side({ field: [{ id: 'y_147' }], hand: ['y_136', 'y_116', 'y_117', 'y_138', 'y_142'], nap: ['y_29'], ice: 4, acorns: 2, exSkills: { dice: { uses: 1 }, healing: { uses: 3 }, abyss: { uses: 2 } } }),
    side({ field: [{ id: 'y_145' }], hand: ['s_6'] }),
  ],
};

export async function openEditorBoard(page, position) {
  await page.goto('/game/editor/');
  await page.getByRole('textbox', { name: '盤面のコード', exact: true }).fill(encodePosition(position));
  await page.getByRole('button', { name: 'この盤面を開く', exact: true }).click();
  await expect(page.getByRole('toolbar', { name: '盤面エディタ' })).toBeVisible();
}
