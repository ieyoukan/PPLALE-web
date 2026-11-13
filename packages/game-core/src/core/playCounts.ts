import type { Catalog, Player } from '../model.ts';

/** イチゴタイプを持つ「うゆち」のプレイ回数。付与されたタイプはプレイ時点で確定する。 */
export function uyuchiPlayCount(player: Pick<Player, 'played' | 'extraUyuchiPlays'>, catalog: Catalog): number {
    return player.played.filter(id => catalog[id]?.type === 'yojo' && catalog[id].name.includes('うゆち') && catalog[id].fruit === 'strawberry').length
        + (player.extraUyuchiPlays ?? 0);
}
