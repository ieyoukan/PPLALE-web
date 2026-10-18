import type { Catalog, Player } from '@pplale/game-core';

/** Keep the same definitions as the on-play effects (tokens are not real sweets). */
export function cardCounts(player: Player, catalog: Catalog) {
  const sweets = player.played.filter(id => catalog[id]?.type === 'sweet' && !['back_menu', 'currency'].includes(catalog[id].sweetType ?? '') && id !== 's_38');
  return {
    uyuchi: player.played.filter(id => catalog[id]?.name?.includes('うゆち') && catalog[id].fruit === 'strawberry').length,
    sweets: sweets.length,
    sweetKinds: new Set(sweets).size,
    mochida: player.mochidaLeft ?? 0,
  };
}

export function countCards(ids: readonly string[]) {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([id, count]) => ({ id, count }));
}

/** Turn headers are emitted by commands/phases; leading entries may predate the retained log. */
export function logTurns(lines: readonly string[], names: readonly string[]) {
  const groups: { title: string; side?: number; lines: { text: string; index: number }[] }[] = [];
  lines.forEach((text, index) => {
    const side = names.findIndex(name => text.startsWith(`${name}の`) && /^\d+ターン目$/.test(text.slice(name.length + 1)));
    if (side >= 0) groups.push({ title: text, side, lines: [] });
    else {
      if (!groups.length) groups.push({ title: '準備・これまでの履歴', lines: [] });
      groups.at(-1)!.lines.push({ text, index });
    }
  });
  return groups.reverse();
}
